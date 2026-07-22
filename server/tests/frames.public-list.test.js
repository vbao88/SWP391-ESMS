import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { Brand } from "../src/models/Brand.js";
import { Category } from "../src/models/Category.js";
import { Frame } from "../src/models/Frame.js";
import { FrameVariant } from "../src/models/FrameVariant.js";
import { clearTestCollections, connectTestDatabase, disconnectTestDatabase } from "./helpers/database.js";

const models = [FrameVariant, Frame, Brand, Category];
let sequence = 0;

async function fixture(overrides = {}) {
  sequence += 1;
  const brand = overrides.brand ?? await Brand.create({ name: `Brand ${sequence}`, status: overrides.brandStatus ?? "active" });
  const category = overrides.category ?? await Category.create({ name: `Category ${sequence}`, status: overrides.categoryStatus ?? "active" });
  const frame = await Frame.create({
    name: overrides.name ?? `Frame ${sequence}`,
    brandId: brand._id,
    categoryId: category._id,
    shape: overrides.shape ?? "round",
    material: overrides.material ?? "acetate",
    gender: overrides.gender ?? "unisex",
    faceShapes: overrides.faceShapes ?? ["oval"],
    images: overrides.images ?? [],
    status: overrides.frameStatus ?? "active",
  });
  for (const [index, variant] of (overrides.variants ?? [{ color: "Black", price: 100000 }]).entries()) {
    await FrameVariant.create({ frameId: frame._id, sku: `SKU-${sequence}-${index}`, color: variant.color, size: variant.size ?? ["S", "M", "L"][index % 3], price: variant.price, status: variant.status ?? "active" });
  }
  return { brand, category, frame };
}

beforeAll(async () => connectTestDatabase());
beforeEach(async () => { await clearTestCollections(models); sequence = 0; });
afterAll(async () => { await clearTestCollections(models); await disconnectTestDatabase(); });

describe("GET /api/v1/frames", () => {
  it("returns the exact public card DTO, defaults, primary image and priceFrom", async () => {
    const { frame } = await fixture({ images: [
      { url: "https://example.com/second.jpg", altText: "Second", sortOrder: 2, isPrimary: false },
      { url: "https://example.com/primary.jpg", altText: "Primary", sortOrder: 9, isPrimary: true },
    ], variants: [{ color: "Red", price: 200000 }, { color: "Blue", price: 100000 }] });
    const response = await request(app).get("/api/v1/frames");
    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Frames retrieved successfully.");
    expect(response.body.data.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 1, totalPages: 1 });
    expect(response.body.data.items[0]).toEqual({
      id: frame._id.toString(), name: "Frame 1",
      brand: { id: expect.any(String), name: "Brand 1" },
      category: { id: expect.any(String), name: "Category 1" },
      shape: "round", material: "acetate", gender: "unisex", faceShapes: ["oval"],
      primaryImage: { url: "https://example.com/primary.jpg", altText: "Primary" }, priceFrom: 100000,
    });
    expect(JSON.stringify(response.body.data.items[0])).not.toMatch(/_id|status|description|variants|publicId|createdAt|updatedAt|__v/);
  });

  it("falls back to lowest sortOrder and returns null when there are no frame images", async () => {
    await fixture({ name: "With image", images: [
      { url: "https://example.com/high.jpg", altText: "High", sortOrder: 8, isPrimary: false },
      { url: "https://example.com/low.jpg", altText: "Low", sortOrder: 1, isPrimary: false },
    ] });
    await fixture({ name: "Without image" });
    const response = await request(app).get("/api/v1/frames");
    expect(response.body.data.items.map(({ primaryImage }) => primaryImage)).toEqual([
      { url: "https://example.com/low.jpg", altText: "Low" }, null,
    ]);
  });

  it("enforces every public eligibility condition", async () => {
    await fixture({ name: "Eligible" });
    await fixture({ name: "Frame inactive", frameStatus: "inactive" });
    await fixture({ name: "Brand inactive", brandStatus: "inactive" });
    await fixture({ name: "Category inactive", categoryStatus: "inactive" });
    await fixture({ name: "Variant inactive", variants: [{ color: "Black", price: 1, status: "inactive" }] });
    const response = await request(app).get("/api/v1/frames");
    expect(response.body.data.items.map(({ name }) => name)).toEqual(["Eligible"]);
  });

  it("searches frame name, active brand name and active variant SKU case-insensitively", async () => {
    const first = await fixture({ name: "Alpha Optical" });
    const second = await fixture({ name: "Beta" });
    const queries = ["  alpha   optical ", first.brand.name.toUpperCase(), "sku-2-0"];
    const expected = ["Alpha Optical", "Alpha Optical", second.frame.name];
    for (let index = 0; index < queries.length; index += 1) {
      const response = await request(app).get("/api/v1/frames").query({ search: queries[index] });
      expect(response.body.data.items.map(({ name }) => name)).toEqual([expected[index]]);
    }
  });

  it("applies OR within a filter, AND across filters, and preserves priceFrom under color filtering", async () => {
    await fixture({ name: "Match", shape: "round", material: "metal", variants: [{ color: "Black", price: 50 }, { color: "Bright Red", price: 200 }] });
    await fixture({ name: "Wrong material", shape: "square", material: "plastic" });
    const response = await request(app).get("/api/v1/frames").query({ shape: "round,square,round", material: "metal", color: " bright   red " });
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({ name: "Match", priceFrom: 50 });
  });

  it("applies priceFrom bounds, deterministic price sorting and pagination", async () => {
    await fixture({ name: "Charlie", variants: [{ color: "Black", price: 300 }] });
    await fixture({ name: "Alpha", variants: [{ color: "Black", price: 100 }] });
    await fixture({ name: "Bravo", variants: [{ color: "Black", price: 200 }] });
    const response = await request(app).get("/api/v1/frames").query({ minPrice: 100, maxPrice: 300, sort: "price", order: "desc", page: 2, pageSize: 2 });
    expect(response.body.data.items.map(({ name }) => name)).toEqual(["Alpha"]);
    expect(response.body.data.pagination).toEqual({ page: 2, pageSize: 2, totalItems: 3, totalPages: 2 });
  });

  it.each([
    [{ unknown: "x" }], [{ page: 0 }], [{ pageSize: 101 }], [{ brandId: "bad" }],
    [{ shape: "round," }], [{ shape: "hexagon" }], [{ minPrice: 2, maxPrice: 1 }], [{ sort: "sku" }],
  ])("rejects invalid query %#", async (query) => {
    const response = await request(app).get("/api/v1/frames").query(query);
    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation failed");
    expect(response.body.details.length).toBeGreaterThan(0);
  });

  it("is public even with an invalid bearer token and returns the empty pagination contract", async () => {
    const response = await request(app).get("/api/v1/frames").set("Authorization", "Bearer invalid");
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
  });
});
