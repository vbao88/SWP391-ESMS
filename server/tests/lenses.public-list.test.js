import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { Brand } from "../src/models/Brand.js";
import { Lens } from "../src/models/Lens.js";
import { LensOption } from "../src/models/LensOption.js";
import { clearTestCollections, connectTestDatabase, disconnectTestDatabase } from "./helpers/database.js";

const models = [LensOption, Lens, Brand];
let sequence = 0;

async function fixture(overrides = {}) {
  sequence += 1;
  const brand = overrides.brand ?? await Brand.create({ name: `Brand ${sequence}`, status: overrides.brandStatus ?? "active" });
  const lens = await Lens.create({
    name: overrides.name ?? `Lens ${sequence}`,
    description: overrides.description ?? `Description ${sequence}`,
    brandId: brand._id,
    visionType: overrides.visionType ?? "single_vision",
    refractiveIndex: overrides.refractiveIndex ?? "1.60",
    features: overrides.features ?? [],
    basePrice: overrides.basePrice ?? sequence * 100000,
    images: overrides.images ?? [],
    status: overrides.status ?? "active",
  });
  return { brand, lens };
}

beforeAll(async () => connectTestDatabase());
beforeEach(async () => { await clearTestCollections(models); sequence = 0; vi.restoreAllMocks(); });
afterAll(async () => { await clearTestCollections(models); await disconnectTestDatabase(); });

describe("GET /api/v1/lenses", () => {
  it("returns the exact public Lens DTO, response message, defaults and primary image", async () => {
    const { lens, brand } = await fixture({ features: ["blue_light"], images: [
      { url: "https://example.com/fallback.jpg", altText: "Fallback", sortOrder: 1, isPrimary: false, publicId: "secret/fallback" },
      { url: "https://example.com/primary.jpg", altText: "Primary", sortOrder: 9, isPrimary: true, publicId: "secret/primary" },
    ] });
    const response = await request(app).get("/api/v1/lenses");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, message: "Lenses retrieved successfully.", data: {
      items: [{ id: lens._id.toString(), name: lens.name, description: lens.description, brand: { id: brand._id.toString(), name: brand.name }, visionType: "single_vision", refractiveIndex: "1.60", features: ["blue_light"], basePrice: 100000, primaryImage: { url: "https://example.com/primary.jpg", altText: "Primary" } }],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    } });
    expect(JSON.stringify(response.body.data.items[0])).not.toMatch(/_id|__v|status|priceAdjustment|publicId|sortOrder|isPrimary|createdAt|updatedAt|supportedRange|LensOption/);
    expect(response.body.data.items[0]).not.toHaveProperty("price");
  });

  it("is public for Guest and ignores an invalid Bearer token", async () => {
    await fixture();
    for (const authorization of [undefined, "Bearer invalid-token"]) {
      const call = request(app).get("/api/v1/lenses");
      const response = await (authorization ? call.set("Authorization", authorization) : call);
      expect(response.status).toBe(200);
      expect(response.body.data.items).toHaveLength(1);
    }
  });

  it("enforces active Lens and active existing Brand eligibility", async () => {
    await fixture({ name: "Eligible" });
    await fixture({ name: "Inactive Lens", status: "inactive" });
    await fixture({ name: "Inactive Brand", brandStatus: "inactive" });
    await Lens.collection.insertOne({ _id: new mongoose.Types.ObjectId(), name: "Missing Brand", description: "", brandId: new mongoose.Types.ObjectId(), visionType: "single_vision", refractiveIndex: "1.60", features: [], basePrice: 1, images: [], status: "active", createdAt: new Date(), updatedAt: new Date() });
    const response = await request(app).get("/api/v1/lenses");
    expect(response.body.data.items.map(({ name }) => name)).toEqual(["Eligible"]);
  });

  it("does not require or return LensOptions", async () => {
    const withoutOption = await fixture({ name: "No option" });
    const withOption = await fixture({ name: "With option" });
    await LensOption.create({ lensId: withOption.lens._id, type: "coating", value: "Premium", priceAdjustment: 999999, status: "active" });
    const response = await request(app).get("/api/v1/lenses");
    expect(response.body.data.items.map(({ name }) => name)).toEqual(["No option", "With option"]);
    expect(JSON.stringify(response.body.data.items)).not.toMatch(/Premium|999999|priceAdjustment|lensOptions/i);
    expect(withoutOption.lens).toBeTruthy();
  });

  it("searches Lens name and active Brand name with trim/collapse/case-insensitive behavior", async () => {
    const first = await fixture({ name: "Clear   Vision" });
    await fixture({ name: "Other Lens" });
    for (const search of ["  CLEAR   VISION  ", first.brand.name.toUpperCase()]) {
      const response = await request(app).get("/api/v1/lenses").query({ search });
      expect(response.body.data.items.map(({ name }) => name)).toEqual(["Clear   Vision"]);
    }
  });

  it("escapes regex-special search input", async () => {
    await fixture({ name: "Literal [Lens]+" });
    await fixture({ name: "Literal L" });
    const response = await request(app).get("/api/v1/lenses").query({ search: "[Lens]+" });
    expect(response.body.data.items.map(({ name }) => name)).toEqual(["Literal [Lens]+"]);
  });

  it("filters brandId and applies OR within groups and AND across groups", async () => {
    const target = await fixture({ name: "Target", visionType: "single_vision", refractiveIndex: "1.67", features: ["photochromic"] });
    await fixture({ name: "Wrong", visionType: "non_prescription", refractiveIndex: "1.50", features: ["blue_light"] });
    const response = await request(app).get("/api/v1/lenses").query({ brandId: `${target.brand._id},${target.brand._id}`, visionType: "non_prescription,single_vision", refractiveIndex: "1.67", feature: "blue_light,photochromic" });
    expect(response.body.data.items.map(({ name }) => name)).toEqual(["Target"]);
    expect(response.body.data.items[0].refractiveIndex).toBe("1.67");
  });

  it("applies minPrice/maxPrice directly to basePrice", async () => {
    await fixture({ name: "Low", basePrice: 100 });
    await fixture({ name: "Middle", basePrice: 200 });
    await fixture({ name: "High", basePrice: 300 });
    const response = await request(app).get("/api/v1/lenses").query({ minPrice: 150, maxPrice: 250 });
    expect(response.body.data.items.map(({ name, basePrice }) => [name, basePrice])).toEqual([["Middle", 200]]);
  });

  it.each([
    ["name", "asc", ["Alpha", "Bravo", "Charlie"]], ["name", "desc", ["Charlie", "Bravo", "Alpha"]],
    ["price", "asc", ["Alpha", "Bravo", "Charlie"]], ["price", "desc", ["Charlie", "Bravo", "Alpha"]],
  ])("sorts by %s %s", async (sort, order, expected) => {
    await fixture({ name: "Charlie", basePrice: 300 });
    await fixture({ name: "Alpha", basePrice: 100 });
    await fixture({ name: "Bravo", basePrice: 200 });
    const response = await request(app).get("/api/v1/lenses").query({ sort, order });
    expect(response.body.data.items.map(({ name }) => name)).toEqual(expected);
  });

  it("sorts createdAt both ways with deterministic _id tie-breaking", async () => {
    const timestamp = new Date("2025-01-01T00:00:00.000Z");
    const ids = [new mongoose.Types.ObjectId("000000000000000000000001"), new mongoose.Types.ObjectId("000000000000000000000002")];
    const brand = await Brand.create({ name: "Shared Brand" });
    for (let index = 0; index < 2; index += 1) await Lens.collection.insertOne({ _id: ids[index], name: `Same ${index}`, description: "", brandId: brand._id, visionType: "single_vision", refractiveIndex: "1.60", features: [], basePrice: 100, images: [], status: "active", createdAt: timestamp, updatedAt: timestamp });
    for (const order of ["asc", "desc"]) {
      const response = await request(app).get("/api/v1/lenses").query({ sort: "createdAt", order });
      expect(response.body.data.items.map(({ id }) => id)).toEqual(ids.map(String));
    }
  });

  it("uses fallback image by lowest sortOrder/stable array order and null for empty images", async () => {
    await fixture({ name: "A", images: [
      { url: "https://example.com/first.jpg", altText: "First", sortOrder: 2, isPrimary: false },
      { url: "https://example.com/tied.jpg", altText: "Tied", sortOrder: 2, isPrimary: false },
      { url: "https://example.com/high.jpg", altText: "High", sortOrder: 9, isPrimary: false },
    ] });
    await fixture({ name: "B" });
    const response = await request(app).get("/api/v1/lenses");
    expect(response.body.data.items.map(({ primaryImage }) => primaryImage)).toEqual([{ url: "https://example.com/first.jpg", altText: "First" }, null]);
  });

  it("paginates after filtering and returns the exact empty-result contract", async () => {
    await fixture({ name: "A" }); await fixture({ name: "B" }); await fixture({ name: "C" });
    const page = await request(app).get("/api/v1/lenses").query({ page: 2, pageSize: 2 });
    expect(page.body.data.items.map(({ name }) => name)).toEqual(["C"]);
    expect(page.body.data.pagination).toEqual({ page: 2, pageSize: 2, totalItems: 3, totalPages: 2 });
    const empty = await request(app).get("/api/v1/lenses").query({ search: "missing", page: 4, pageSize: 100 });
    expect(empty.status).toBe(200);
    expect(empty.body.data).toEqual({ items: [], pagination: { page: 4, pageSize: 100, totalItems: 0, totalPages: 0 } });
  });

  it.each([
    [{ unknown: "x" }], [{ page: 0 }], [{ page: 1.5 }], [{ pageSize: 101 }], [{ brandId: "bad" }],
    [{ visionType: "progressive" }], [{ refractiveIndex: "1.6" }], [{ feature: "uv" }], [{ feature: "blue_light," }],
    [{ minPrice: -1 }], [{ minPrice: 1.5 }], [{ minPrice: 2, maxPrice: 1 }], [{ sort: "feature" }], [{ order: "up" }],
  ])("rejects invalid query %#", async (query) => {
    const response = await request(app).get("/api/v1/lenses").query(query);
    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation failed");
    expect(response.body.details.length).toBeGreaterThan(0);
  });

  it("returns the existing 500 envelope for an unexpected database error", async () => {
    vi.spyOn(Lens, "aggregate").mockRejectedValueOnce(new Error("database secret"));
    const response = await request(app).get("/api/v1/lenses");
    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Internal server error");
    expect(response.body.details).toBeNull();
  });
});
