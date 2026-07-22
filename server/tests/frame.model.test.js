import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Brand } from "../src/models/Brand.js";
import { Category } from "../src/models/Category.js";
import { Frame } from "../src/models/Frame.js";
import {
  clearTestCollections,
  connectTestDatabase,
  disconnectTestDatabase,
} from "./helpers/database.js";

let brand;
let category;

function validFrame(overrides = {}) {
  return {
    name: "  Classic Frame  ",
    brandId: brand._id,
    categoryId: category._id,
    shape: "rectangle",
    material: "acetate",
    gender: "unisex",
    faceShapes: ["oval", "heart"],
    ...overrides,
  };
}

function validImage(overrides = {}) {
  return {
    url: "https://cdn.example.com/frame.jpg",
    publicId: "  frames/classic  ",
    altText: "  Classic frame  ",
    sortOrder: 0,
    isPrimary: true,
    ...overrides,
  };
}

beforeAll(async () => {
  await connectTestDatabase();
  await Promise.all([Brand.init(), Category.init(), Frame.init()]);
});

beforeEach(async () => {
  await clearTestCollections([Frame, Brand, Category]);
  [brand, category] = await Promise.all([
    Brand.create({ name: "Frame Test Brand" }),
    Category.create({ name: "Frame Test Category" }),
  ]);
});

afterAll(async () => {
  await clearTestCollections([Frame, Brand, Category]);
  await disconnectTestDatabase();
});

describe("Frame model contract", () => {
  it("creates an exact valid document, trims strings, and applies defaults", async () => {
    const frame = await Frame.create(validFrame());
    expect(frame.toObject()).toMatchObject({
      name: "Classic Frame",
      description: "",
      brandId: brand._id,
      categoryId: category._id,
      shape: "rectangle",
      material: "acetate",
      gender: "unisex",
      faceShapes: ["oval", "heart"],
      images: [],
      status: "active",
    });
    expect(frame.createdAt).toBeInstanceOf(Date);
    expect(frame.updatedAt).toBeInstanceOf(Date);
    expect(Object.keys(frame.toObject()).sort()).toEqual(
      [
        "__v",
        "_id",
        "brandId",
        "categoryId",
        "createdAt",
        "description",
        "faceShapes",
        "gender",
        "images",
        "material",
        "name",
        "shape",
        "status",
        "updatedAt",
      ].sort(),
    );
  });

  it("stores trimmed description and exact embedded Media fields without embedded _id", async () => {
    const frame = await Frame.create(
      validFrame({ description: "  Lightweight frame  ", images: [validImage()] }),
    );
    expect(frame.description).toBe("Lightweight frame");
    expect(frame.images[0].toObject()).toEqual({
      url: "https://cdn.example.com/frame.jpg",
      publicId: "frames/classic",
      altText: "Classic frame",
      sortOrder: 0,
      isPrimary: true,
    });
  });

  it.each(["name", "brandId", "categoryId", "shape", "material", "gender", "faceShapes"])(
    "requires %s",
    async (field) => {
      const payload = validFrame();
      delete payload[field];
      await expect(Frame.create(payload)).rejects.toThrow();
    },
  );

  it("rejects a blank name and an empty faceShapes array", async () => {
    await expect(Frame.create(validFrame({ name: "   " }))).rejects.toThrow();
    await expect(Frame.create(validFrame({ faceShapes: [] }))).rejects.toThrow();
  });

  it.each([
    ["shape", "cat-eye"],
    ["material", "wood"],
    ["gender", "adult"],
    ["faceShapes", ["triangle"]],
    ["status", "archived"],
  ])("rejects invalid controlled %s", async (field, value) => {
    await expect(Frame.create(validFrame({ [field]: value }))).rejects.toThrow();
  });

  it("accepts every controlled value and both lifecycle statuses", async () => {
    for (const [index, values] of [
      [0, { shape: "round", faceShape: "round", material: "acetate", gender: "unisex", status: "active" }],
      [1, { shape: "square", faceShape: "square", material: "metal", gender: "men", status: "inactive" }],
      [2, { shape: "rectangle", faceShape: "heart", material: "titanium", gender: "women" }],
      [3, { shape: "oval", faceShape: "oval", material: "plastic", gender: "kids" }],
    ]) {
      const { faceShape, ...frameValues } = values;
      await expect(
        Frame.create(validFrame({ name: `Frame ${index}`, faceShapes: [faceShape], ...frameValues })),
      ).resolves.toBeDefined();
    }
  });

  it("requires unique faceShapes", async () => {
    await expect(Frame.create(validFrame({ faceShapes: ["oval", "oval"] }))).rejects.toThrow();
  });

  it("requires existing Brand and Category references", async () => {
    await expect(
      Frame.create(validFrame({ brandId: new mongoose.Types.ObjectId() })),
    ).rejects.toThrow("Brand does not exist");
    await expect(
      Frame.create(validFrame({ categoryId: new mongoose.Types.ObjectId() })),
    ).rejects.toThrow("Category does not exist");
    expect(Frame.schema.path("brandId").options.ref).toBe("Brand");
    expect(Frame.schema.path("categoryId").options.ref).toBe("Category");
  });

  it.each([
    ["non-HTTP URL", { url: "ftp://example.com/frame.jpg" }],
    ["empty publicId", { publicId: "   " }],
    ["blank altText", { altText: "   " }],
    ["long altText", { altText: "a".repeat(161) }],
    ["negative sortOrder", { sortOrder: -1 }],
    ["large sortOrder", { sortOrder: 1001 }],
    ["fractional sortOrder", { sortOrder: 1.5 }],
    ["non-boolean isPrimary", { isPrimary: "true" }],
  ])("rejects Media with %s", async (_label, overrides) => {
    await expect(Frame.create(validFrame({ images: [validImage(overrides)] }))).rejects.toThrow();
  });

  it("rejects multiple primary images and accepts no primary image", async () => {
    await expect(
      Frame.create(
        validFrame({
          images: [validImage(), validImage({ url: "https://cdn.example.com/second.jpg" })],
        }),
      ),
    ).rejects.toThrow("Only one primary image is allowed");

    await expect(
      Frame.create(
        validFrame({
          images: [validImage({ isPrimary: false }), validImage({ isPrimary: false, sortOrder: 1 })],
        }),
      ),
    ).resolves.toBeDefined();
  });

  it("declares only the specified non-unique compound query index", () => {
    expect(Frame.schema.indexes()).toEqual([
      [{ brandId: 1, categoryId: 1, status: 1 }, {}],
    ]);
  });

  it("does not impose Frame uniqueness", async () => {
    await Frame.create(validFrame({ name: "Same name" }));
    await expect(Frame.create(validFrame({ name: "Same name" }))).resolves.toBeDefined();
  });
});
