import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Brand } from "../src/models/Brand.js";
import { Lens } from "../src/models/Lens.js";
import {
  clearTestCollections,
  connectTestDatabase,
  disconnectTestDatabase,
} from "./helpers/database.js";

let brand;

function validLens(overrides = {}) {
  return {
    name: "  Clear Vision Lens  ",
    brandId: brand._id,
    visionType: "single_vision",
    refractiveIndex: "1.60",
    basePrice: 1200000,
    ...overrides,
  };
}

function validImage(overrides = {}) {
  return {
    url: "https://cdn.example.com/lens.jpg",
    publicId: "  lenses/clear-vision  ",
    altText: "  Clear vision lens  ",
    sortOrder: 0,
    isPrimary: true,
    ...overrides,
  };
}

beforeAll(async () => {
  await connectTestDatabase();
  await Promise.all([Brand.init(), Lens.init()]);
});

beforeEach(async () => {
  await clearTestCollections([Lens, Brand]);
  brand = await Brand.create({ name: "Lens Test Brand" });
});

afterAll(async () => {
  await clearTestCollections([Lens, Brand]);
  await disconnectTestDatabase();
});

describe("Lens model contract", () => {
  it("creates exact fields, trims strings, applies defaults, and adds timestamps", async () => {
    const lens = await Lens.create(validLens());
    expect(lens.toObject()).toMatchObject({
      name: "Clear Vision Lens",
      description: "",
      brandId: brand._id,
      visionType: "single_vision",
      refractiveIndex: "1.60",
      features: [],
      basePrice: 1200000,
      images: [],
      status: "active",
    });
    expect(lens.createdAt).toBeInstanceOf(Date);
    expect(lens.updatedAt).toBeInstanceOf(Date);
    expect(Object.keys(lens.toObject()).sort()).toEqual(
      [
        "__v", "_id", "basePrice", "brandId", "createdAt", "description", "features",
        "images", "name", "refractiveIndex", "status", "updatedAt", "visionType",
      ].sort(),
    );
    expect(lens.toObject()).not.toHaveProperty("price");
  });

  it("stores trimmed optional description and exact embedded Media fields", async () => {
    const lens = await Lens.create(
      validLens({ description: "  Premium optical lens  ", images: [validImage()] }),
    );
    expect(lens.description).toBe("Premium optical lens");
    expect(lens.images[0].toObject()).toEqual({
      url: "https://cdn.example.com/lens.jpg",
      publicId: "lenses/clear-vision",
      altText: "Clear vision lens",
      sortOrder: 0,
      isPrimary: true,
    });
  });

  it.each(["name", "brandId", "visionType", "refractiveIndex", "basePrice"])(
    "requires %s",
    async (field) => {
      const payload = validLens();
      delete payload[field];
      await expect(Lens.create(payload)).rejects.toThrow();
    },
  );

  it("rejects a blank name", async () => {
    await expect(Lens.create(validLens({ name: "   " }))).rejects.toThrow();
  });

  it("uses Brand ref metadata and requires an existing Brand", async () => {
    expect(Lens.schema.path("brandId").options.ref).toBe("Brand");
    await expect(Lens.create(validLens())).resolves.toBeDefined();
    await expect(
      Lens.create(validLens({ brandId: new mongoose.Types.ObjectId() })),
    ).rejects.toThrow("Brand does not exist");
    await expect(Lens.create(validLens({ brandId: "invalid" }))).rejects.toThrow();
  });

  it.each(["non_prescription", "single_vision"])("accepts visionType %s", async (visionType) => {
    expect((await Lens.create(validLens({ visionType }))).visionType).toBe(visionType);
  });

  it("rejects an invalid visionType", async () => {
    await expect(Lens.create(validLens({ visionType: "progressive" }))).rejects.toThrow();
  });

  it.each(["1.50", "1.56", "1.60", "1.67"])(
    "stores refractiveIndex %s as a canonical string",
    async (refractiveIndex) => {
      const lens = await Lens.create(validLens({ refractiveIndex }));
      expect(lens.refractiveIndex).toBe(refractiveIndex);
      expect(typeof lens.refractiveIndex).toBe("string");
    },
  );

  it.each([1.6, "1.6", "1.74"])("rejects invalid refractiveIndex %#", async (refractiveIndex) => {
    await expect(Lens.create(validLens({ refractiveIndex }))).rejects.toThrow();
  });

  it("accepts unique controlled features and rejects invalid or duplicate values", async () => {
    expect(
      (await Lens.create(validLens({ features: ["blue_light", "photochromic"] }))).features,
    ).toEqual(["blue_light", "photochromic"]);
    await expect(Lens.create(validLens({ features: ["polarized"] }))).rejects.toThrow();
    await expect(
      Lens.create(validLens({ features: ["blue_light", "blue_light"] })),
    ).rejects.toThrow("Lens features must be unique");
  });

  it.each([0, 1, 2000000])("accepts integer basePrice %s", async (basePrice) => {
    await expect(Lens.create(validLens({ basePrice }))).resolves.toBeDefined();
  });

  it.each([-1, 1.5])("rejects invalid basePrice %s", async (basePrice) => {
    await expect(Lens.create(validLens({ basePrice }))).rejects.toThrow();
  });

  it.each(["active", "inactive"])("accepts status %s", async (status) => {
    expect((await Lens.create(validLens({ status }))).status).toBe(status);
  });

  it("rejects invalid status", async () => {
    await expect(Lens.create(validLens({ status: "archived" }))).rejects.toThrow();
  });

  it("enforces embedded Media integrity and the single-primary rule", async () => {
    await expect(
      Lens.create(validLens({ images: [validImage({ url: "ftp://example.com/lens.jpg" })] })),
    ).rejects.toThrow();
    await expect(
      Lens.create(
        validLens({
          images: [validImage(), validImage({ url: "https://cdn.example.com/second.jpg" })],
        }),
      ),
    ).rejects.toThrow("Only one primary image is allowed");
  });

  it("declares no Lens index or unauthorized uniqueness", async () => {
    expect(Lens.schema.indexes()).toEqual([]);
    await Lens.create(validLens({ name: "Duplicate Lens" }));
    await expect(Lens.create(validLens({ name: "Duplicate Lens" }))).resolves.toBeDefined();
  });

  it("does not persist explicitly forbidden/deferred fields", async () => {
    const lens = await Lens.create(
      validLens({
        price: 10,
        supportedRange: {},
        compatibility: {},
        inventory: 5,
        slug: "clear-vision",
      }),
    );
    for (const field of ["price", "supportedRange", "compatibility", "inventory", "slug"]) {
      expect(lens.toObject()).not.toHaveProperty(field);
    }
  });
});
