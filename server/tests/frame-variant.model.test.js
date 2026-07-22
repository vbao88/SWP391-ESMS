import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Brand } from "../src/models/Brand.js";
import { Category } from "../src/models/Category.js";
import { Frame } from "../src/models/Frame.js";
import { FrameVariant } from "../src/models/FrameVariant.js";
import {
  clearTestCollections,
  connectTestDatabase,
  disconnectTestDatabase,
} from "./helpers/database.js";

let frame;
let secondFrame;
let brandId;
let categoryId;

function validFrame(name) {
  return {
    name,
    brandId,
    categoryId,
    shape: "rectangle",
    material: "acetate",
    gender: "unisex",
    faceShapes: ["oval"],
  };
}

function validVariant(overrides = {}) {
  return {
    frameId: frame._id,
    sku: "  fv-black-m  ",
    color: "  Midnight   Black  ",
    size: "M",
    price: 1500000,
    ...overrides,
  };
}

function validImage(overrides = {}) {
  return {
    url: "https://cdn.example.com/variant.jpg",
    altText: "Variant image",
    sortOrder: 0,
    isPrimary: true,
    ...overrides,
  };
}

const models = [FrameVariant, Frame, Brand, Category];

beforeAll(async () => {
  await connectTestDatabase();
  await Promise.all(models.map((Model) => Model.init()));
});

beforeEach(async () => {
  await clearTestCollections(models);
  const [brand, category] = await Promise.all([
    Brand.create({ name: "Variant Test Brand" }),
    Category.create({ name: "Variant Test Category" }),
  ]);
  brandId = brand._id;
  categoryId = category._id;
  [frame, secondFrame] = await Promise.all([
    Frame.create(validFrame("First Frame")),
    Frame.create(validFrame("Second Frame")),
  ]);
});

afterAll(async () => {
  await clearTestCollections(models);
  await disconnectTestDatabase();
});

describe("FrameVariant model contract", () => {
  it("creates the exact fields, normalizes values, applies defaults, and timestamps", async () => {
    const variant = await FrameVariant.create(validVariant());
    expect(variant.toObject()).toMatchObject({
      frameId: frame._id,
      sku: "FV-BLACK-M",
      color: "Midnight Black",
      colorNormalized: "midnight black",
      size: "M",
      sizeNormalized: "m",
      price: 1500000,
      images: [],
      status: "active",
    });
    expect(variant.createdAt).toBeInstanceOf(Date);
    expect(variant.updatedAt).toBeInstanceOf(Date);
    expect(Object.keys(variant.toObject()).sort()).toEqual(
      [
        "__v", "_id", "color", "colorNormalized", "createdAt", "frameId", "images",
        "price", "size", "sizeNormalized", "sku", "status", "updatedAt",
      ].sort(),
    );
  });

  it.each(["frameId", "sku", "color", "size", "price"])("requires %s", async (field) => {
    const payload = validVariant();
    delete payload[field];
    await expect(FrameVariant.create(payload)).rejects.toThrow();
  });

  it("stores Frame reference metadata and accepts only an existing Frame", async () => {
    expect(FrameVariant.schema.path("frameId").options.ref).toBe("Frame");
    await expect(FrameVariant.create(validVariant())).resolves.toBeDefined();
    await expect(
      FrameVariant.create(validVariant({ frameId: new mongoose.Types.ObjectId(), sku: "MISSING-1" })),
    ).rejects.toThrow("Frame does not exist");
    await expect(FrameVariant.create(validVariant({ frameId: "invalid" }))).rejects.toThrow();
  });

  it("trims and uppercases SKU before applying the regex", async () => {
    expect((await FrameVariant.create(validVariant({ sku: "  abc_123  " }))).sku).toBe("ABC_123");
  });

  it.each(["AB", "-ABC", "A B", "A.B", `A${"B".repeat(64)}`])(
    "rejects invalid SKU %s",
    async (sku) => {
      await expect(FrameVariant.create(validVariant({ sku }))).rejects.toThrow();
    },
  );

  it("accepts SKU regex length boundaries", async () => {
    await expect(FrameVariant.create(validVariant({ sku: "ABC" }))).resolves.toBeDefined();
    await expect(
      FrameVariant.create(validVariant({ frameId: secondFrame._id, sku: `A${"B".repeat(63)}` })),
    ).resolves.toBeDefined();
  });

  it("enforces global SKU uniqueness at database level", async () => {
    await FrameVariant.create(validVariant({ sku: "GLOBAL-1" }));
    await expect(
      FrameVariant.create(validVariant({ frameId: secondFrame._id, sku: "global-1" })),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("keeps frameId and SKU immutable after creation", async () => {
    const variant = await FrameVariant.create(validVariant({ sku: "LOCKED-1" }));
    variant.frameId = secondFrame._id;
    variant.sku = "CHANGED-1";
    await variant.save();
    const stored = await FrameVariant.findById(variant._id);
    expect(stored.frameId).toEqual(frame._id);
    expect(stored.sku).toBe("LOCKED-1");
  });

  it.each([0, 1, 2000000])("accepts integer price %s", async (price) => {
    await expect(FrameVariant.create(validVariant({ price }))).resolves.toBeDefined();
  });

  it.each([-1, 1.5])("rejects invalid price %s", async (price) => {
    await expect(FrameVariant.create(validVariant({ price }))).rejects.toThrow();
  });

  it.each(["S", "M", "L"])("accepts size %s", async (size) => {
    const variant = await FrameVariant.create(validVariant({ size }));
    expect(variant.sizeNormalized).toBe(size.toLowerCase());
  });

  it.each(["XS", "m", "XL"])("rejects size %s", async (size) => {
    await expect(FrameVariant.create(validVariant({ size }))).rejects.toThrow();
  });

  it("keeps normalized fields synchronized and ignores supplied derived values", async () => {
    const variant = await FrameVariant.create(
      validVariant({ colorNormalized: "wrong", sizeNormalized: "wrong" }),
    );
    expect(variant.colorNormalized).toBe("midnight black");
    expect(variant.sizeNormalized).toBe("m");

    variant.color = "  Xanh   Đậm  ";
    variant.size = "L";
    await variant.save();
    expect(variant.color).toBe("Xanh Đậm");
    expect(variant.colorNormalized).toBe("xanh đậm");
    expect(variant.sizeNormalized).toBe("l");

    await FrameVariant.findByIdAndUpdate(variant._id, { color: "  Pearl   White ", size: "S" }, { runValidators: true });
    const updated = await FrameVariant.findById(variant._id);
    expect(updated.toObject()).toMatchObject({
      color: "Pearl White",
      colorNormalized: "pearl white",
      size: "S",
      sizeNormalized: "s",
    });
  });

  it("enforces normalized color/size uniqueness within one Frame", async () => {
    await FrameVariant.create(validVariant({ sku: "COLOR-1", color: "Matte Black", size: "M" }));
    await expect(
      FrameVariant.create(validVariant({ sku: "COLOR-2", color: "  matte   black ", size: "M" })),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("allows the same normalized color/size on different Frames", async () => {
    await FrameVariant.create(validVariant({ sku: "FRAME-1", color: "Black", size: "S" }));
    await expect(
      FrameVariant.create(
        validVariant({ frameId: secondFrame._id, sku: "FRAME-2", color: " black ", size: "S" }),
      ),
    ).resolves.toBeDefined();
  });

  it.each(["active", "inactive"])("accepts status %s", async (status) => {
    expect((await FrameVariant.create(validVariant({ status }))).status).toBe(status);
  });

  it("rejects invalid status", async () => {
    await expect(FrameVariant.create(validVariant({ status: "archived" }))).rejects.toThrow();
  });

  it("enforces embedded Media integrity and single-primary behavior", async () => {
    const variant = await FrameVariant.create(validVariant({ images: [validImage()] }));
    expect(variant.images[0].toObject()).toEqual(validImage());
    await expect(
      FrameVariant.create(
        validVariant({
          sku: "IMAGE-2",
          images: [validImage(), validImage({ url: "https://cdn.example.com/second.jpg" })],
        }),
      ),
    ).rejects.toThrow("Only one primary image is allowed");
  });

  it("declares exactly the required indexes without duplicate declarations", () => {
    expect(FrameVariant.schema.indexes()).toEqual([
      [{ sku: 1 }, { unique: true }],
      [{ frameId: 1, status: 1 }, {}],
      [{ frameId: 1, colorNormalized: 1, sizeNormalized: 1 }, { unique: true }],
    ]);
  });
});
