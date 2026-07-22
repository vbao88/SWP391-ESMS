import mongoose from "mongoose";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { Brand } from "../src/models/Brand.js";
import { Category } from "../src/models/Category.js";
import { Frame } from "../src/models/Frame.js";
import { FrameVariant } from "../src/models/FrameVariant.js";
import { clearTestCollections, connectTestDatabase, disconnectTestDatabase } from "./helpers/database.js";

const models = [FrameVariant, Frame, Brand, Category];
let sequence = 0;

function media(label, sortOrder, isPrimary = false) {
  return {
    url: `https://example.com/${label}.jpg`,
    publicId: `private-${label}`,
    altText: label,
    sortOrder,
    isPrimary,
  };
}

async function fixture(overrides = {}) {
  sequence += 1;
  const brand = overrides.brand ?? await Brand.create({ name: `Brand ${sequence}`, status: overrides.brandStatus ?? "active" });
  const category = overrides.category ?? await Category.create({ name: `Category ${sequence}`, status: overrides.categoryStatus ?? "active" });
  const frame = await Frame.create({
    name: overrides.name ?? `Frame ${sequence}`,
    description: overrides.description ?? `Description ${sequence}`,
    brandId: brand._id,
    categoryId: category._id,
    shape: overrides.shape ?? "round",
    material: overrides.material ?? "acetate",
    gender: overrides.gender ?? "unisex",
    faceShapes: overrides.faceShapes ?? ["oval"],
    images: overrides.images ?? [],
    status: overrides.frameStatus ?? "active",
  });
  const variants = [];
  const variantInputs = overrides.variants === undefined
    ? [{ sku: `SKU-${sequence}-0`, color: "Black", size: "M", price: 100000 }]
    : overrides.variants;
  for (const [index, variant] of variantInputs.entries()) {
    variants.push(await FrameVariant.create({
      frameId: frame._id,
      sku: variant.sku ?? `SKU-${sequence}-${index}`,
      color: variant.color ?? "Black",
      size: variant.size ?? ["S", "M", "L"][index % 3],
      price: variant.price ?? 100000,
      images: variant.images ?? [],
      status: variant.status ?? "active",
    }));
  }
  return { brand, category, frame, variants };
}

beforeAll(async () => connectTestDatabase());
beforeEach(async () => {
  await clearTestCollections(models);
  sequence = 0;
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await clearTestCollections(models);
  await disconnectTestDatabase();
});

describe("GET /api/v1/frames/:frameId", () => {
  it("is public for guests and ignores an invalid bearer token", async () => {
    const { frame } = await fixture();
    const guest = await request(app).get(`/api/v1/frames/${frame._id}`);
    const invalidToken = await request(app)
      .get(`/api/v1/frames/${frame._id}`)
      .set("Authorization", "Bearer invalid");
    expect(guest.status).toBe(200);
    expect(invalidToken.status).toBe(200);
    expect(invalidToken.body.data).toEqual(guest.body.data);
  });

  it("returns the exact success envelope and detail DTO allowlists", async () => {
    const { brand, category, frame, variants } = await fixture({
      images: [media("frame", 1, true)],
      variants: [{ sku: "DETAIL-1", color: "Blue", size: "L", price: 250000, images: [media("variant", 2, true)] }],
    });
    const response = await request(app).get(`/api/v1/frames/${frame._id}`);
    expect(response.status).toBe(200);
    expect(Object.keys(response.body)).toEqual(["success", "message", "data"]);
    expect(response.body).toEqual({
      success: true,
      message: "Frame retrieved successfully.",
      data: {
        id: frame._id.toString(),
        name: "Frame 1",
        brand: { id: brand._id.toString(), name: "Brand 1" },
        category: { id: category._id.toString(), name: "Category 1" },
        shape: "round",
        material: "acetate",
        gender: "unisex",
        faceShapes: ["oval"],
        primaryImage: { url: "https://example.com/frame.jpg", altText: "frame" },
        priceFrom: 250000,
        description: "Description 1",
        images: [{ url: "https://example.com/frame.jpg", altText: "frame", sortOrder: 1, isPrimary: true }],
        variants: [{
          id: variants[0]._id.toString(),
          sku: "DETAIL-1",
          color: "Blue",
          size: "L",
          price: 250000,
          images: [{ url: "https://example.com/variant.jpg", altText: "variant", sortOrder: 2, isPrimary: true }],
          primaryImage: { url: "https://example.com/variant.jpg", altText: "variant" },
        }],
      },
    });
    expect(JSON.stringify(response.body.data)).not.toMatch(/publicId|_id|__v|status|createdAt|updatedAt|Normalized|quantity|availability|rating|reviews/);
    expect(response.body.data).not.toHaveProperty("pagination");
  });

  it("rejects malformed IDs before a database lookup", async () => {
    const aggregate = vi.spyOn(Frame, "aggregate");
    for (const frameId of ["short", "z".repeat(24)]) {
      const response = await request(app).get(`/api/v1/frames/${frameId}`);
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Validation failed");
      expect(Array.isArray(response.body.details)).toBe(true);
    }
    expect(aggregate).not.toHaveBeenCalled();
  });

  it("returns the controlled 404 for an unknown valid ID", async () => {
    const response = await request(app).get(`/api/v1/frames/${new mongoose.Types.ObjectId()}`);
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ success: false, message: "Frame not found", details: null });
  });

  it("conceals every ineligible frame with the same 404 contract", async () => {
    const inactiveFrame = await fixture({ frameStatus: "inactive" });
    const inactiveBrand = await fixture({ brandStatus: "inactive" });
    const missingBrand = await fixture();
    await Brand.collection.deleteOne({ _id: missingBrand.brand._id });
    const inactiveCategory = await fixture({ categoryStatus: "inactive" });
    const missingCategory = await fixture();
    await Category.collection.deleteOne({ _id: missingCategory.category._id });
    const noVariants = await fixture({ variants: [] });
    const inactiveVariants = await fixture({ variants: [{ status: "inactive" }] });

    for (const item of [inactiveFrame, inactiveBrand, missingBrand, inactiveCategory, missingCategory, noVariants, inactiveVariants]) {
      const response = await request(app).get(`/api/v1/frames/${item.frame._id}`);
      expect(response.status).toBe(404);
      expect(response.body.message).toBe("Frame not found");
      expect(response.body.details).toBeNull();
      expect(response.body.message).not.toMatch(/inactive|brand|category|variant/i);
    }
  });

  it("returns active variants once, orders them deterministically, and derives priceFrom from active prices", async () => {
    const { frame, variants } = await fixture({ variants: [
      { sku: "ORDER-Z", color: "Blue", size: "S", price: 500 },
      { sku: "ORDER-B", color: "Amber", size: "M", price: 300 },
      { sku: "ORDER-A", color: "Amber", size: "L", price: 200 },
      { sku: "ORDER-X", color: "Amber", size: "S", price: 1, status: "inactive" },
    ] });
    const originalAggregate = Frame.aggregate.bind(Frame);
    let capturedPipeline;
    vi.spyOn(Frame, "aggregate").mockImplementation((pipeline) => {
      capturedPipeline = pipeline;
      return originalAggregate(pipeline);
    });
    const response = await request(app).get(`/api/v1/frames/${frame._id}`);
    expect(response.status).toBe(200);
    expect(response.body.data.variants.map(({ sku }) => sku)).toEqual(["ORDER-A", "ORDER-B", "ORDER-Z"]);
    expect(new Set(response.body.data.variants.map(({ id }) => id)).size).toBe(3);
    expect(response.body.data.priceFrom).toBe(200);
    expect(JSON.stringify(response.body.data)).not.toContain(variants[3]._id.toString());
    const variantLookup = capturedPipeline.find((stage) => stage.$lookup?.from === "framevariants");
    expect(variantLookup.$lookup.pipeline).toContainEqual({ $sort: { color: 1, size: 1, sku: 1, _id: 1 } });
  });

  it("orders frame images by sortOrder then stored index and resolves multiple primaries by the same order", async () => {
    const { frame } = await fixture({ images: [media("equal-first", 5), media("low", 1), media("equal-second", 5)] });
    await Frame.collection.updateOne({ _id: frame._id }, { $set: { images: [
      media("equal-first", 5, true), media("low", 1, false), media("equal-second", 5, true),
    ] } });
    const response = await request(app).get(`/api/v1/frames/${frame._id}`);
    expect(response.body.data.images.map(({ altText }) => altText)).toEqual(["low", "equal-first", "equal-second"]);
    expect(response.body.data.primaryImage).toEqual({ url: "https://example.com/equal-first.jpg", altText: "equal-first" });
    expect(JSON.stringify(response.body.data.images)).not.toMatch(/publicId|_id/);
  });

  it("orders variant images stably, prefers its own selected image, and does not copy frame fallback into images", async () => {
    const { frame, variants } = await fixture({
      images: [media("frame-primary", 9, true)],
      variants: [
        { sku: "MEDIA-OWN", images: [media("own-first", 3), media("own-low", 1), media("own-second", 3)] },
        { sku: "MEDIA-FALLBACK", color: "White", images: [] },
      ],
    });
    await FrameVariant.collection.updateOne({ _id: variants[0]._id }, { $set: { images: [
      media("own-first", 3, true), media("own-low", 1, false), media("own-second", 3, true),
    ] } });
    const response = await request(app).get(`/api/v1/frames/${frame._id}`);
    const own = response.body.data.variants.find(({ sku }) => sku === "MEDIA-OWN");
    const fallback = response.body.data.variants.find(({ sku }) => sku === "MEDIA-FALLBACK");
    expect(own.images.map(({ altText }) => altText)).toEqual(["own-low", "own-first", "own-second"]);
    expect(own.primaryImage).toEqual({ url: "https://example.com/own-first.jpg", altText: "own-first" });
    expect(fallback.images).toEqual([]);
    expect(fallback.primaryImage).toEqual({ url: "https://example.com/frame-primary.jpg", altText: "frame-primary" });
  });

  it("uses the lowest ordered image when no primary exists and null when frame and variant have no images", async () => {
    const withImages = await fixture({ images: [media("high", 8), media("first-tie", 2), media("second-tie", 2)] });
    const noImages = await fixture({ images: [], variants: [{ sku: "NO-IMAGE", images: [] }] });
    const first = await request(app).get(`/api/v1/frames/${withImages.frame._id}`);
    expect(first.body.data.primaryImage).toEqual({ url: "https://example.com/first-tie.jpg", altText: "first-tie" });
    const second = await request(app).get(`/api/v1/frames/${noImages.frame._id}`);
    expect(second.body.data.primaryImage).toBeNull();
    expect(second.body.data.variants[0].primaryImage).toBeNull();
  });

  it("returns a controlled 500 without leaking database details", async () => {
    const { frame } = await fixture();
    vi.spyOn(Frame, "aggregate").mockRejectedValueOnce(new Error("sensitive database failure"));
    const response = await request(app).get(`/api/v1/frames/${frame._id}`);
    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Internal server error");
    expect(response.body.details).toBeNull();
    expect(JSON.stringify({ message: response.body.message, details: response.body.details })).not.toContain("sensitive database failure");
  });
});
