import { describe, expect, it } from "vitest";
import {
  createFrameSchema,
  updateFrameSchema,
  updateFrameStatusSchema,
} from "../src/validations/frame.validation.js";

const brandId = "507f1f77bcf86cd799439011";
const categoryId = "507f191e810c19729de860ea";

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

function validCreate(overrides = {}) {
  return {
    name: "  Classic Frame  ",
    description: "  Lightweight  ",
    brandId,
    categoryId,
    shape: "rectangle",
    material: "acetate",
    gender: "unisex",
    faceShapes: ["oval", "heart"],
    images: [validImage()],
    ...overrides,
  };
}

describe("Frame validation foundation", () => {
  it("accepts and normalizes a complete create payload", () => {
    const result = createFrameSchema.validate(validCreate());
    expect(result.error).toBeUndefined();
    expect(result.value).toMatchObject({
      name: "Classic Frame",
      description: "Lightweight",
      images: [
        {
          url: "https://cdn.example.com/frame.jpg",
          publicId: "frames/classic",
          altText: "Classic frame",
          sortOrder: 0,
          isPrimary: true,
        },
      ],
    });
  });

  it.each(["name", "brandId", "categoryId", "shape", "material", "gender", "faceShapes"])(
    "rejects create without required %s",
    (field) => {
      const payload = validCreate();
      delete payload[field];
      expect(createFrameSchema.validate(payload).error).toBeDefined();
    },
  );

  it.each([
    ["blank name", { name: "   " }],
    ["invalid brandId", { brandId: "invalid" }],
    ["invalid categoryId", { categoryId: "invalid" }],
    ["invalid shape", { shape: "cat-eye" }],
    ["invalid material", { material: "wood" }],
    ["invalid gender", { gender: "adult" }],
    ["empty faceShapes", { faceShapes: [] }],
    ["duplicate faceShapes", { faceShapes: ["oval", "oval"] }],
    ["invalid faceShape", { faceShapes: ["triangle"] }],
  ])("rejects create with %s", (_label, overrides) => {
    expect(createFrameSchema.validate(validCreate(overrides)).error).toBeDefined();
  });

  it.each([
    ["non-HTTP URL", { url: "ftp://example.com/frame.jpg" }],
    ["blank publicId", { publicId: "   " }],
    ["blank altText", { altText: "   " }],
    ["long altText", { altText: "a".repeat(161) }],
    ["negative sortOrder", { sortOrder: -1 }],
    ["large sortOrder", { sortOrder: 1001 }],
    ["fractional sortOrder", { sortOrder: 1.5 }],
    ["non-boolean isPrimary", { isPrimary: "true" }],
  ])("rejects Media with %s", (_label, overrides) => {
    expect(
      createFrameSchema.validate(validCreate({ images: [validImage(overrides)] })).error,
    ).toBeDefined();
  });

  it("rejects multiple primary images and accepts arrays without a primary", () => {
    expect(
      createFrameSchema.validate(
        validCreate({
          images: [validImage(), validImage({ url: "https://cdn.example.com/second.jpg" })],
        }),
      ).error,
    ).toBeDefined();
    expect(
      createFrameSchema.validate(
        validCreate({ images: [validImage({ isPrimary: false })] }),
      ).error,
    ).toBeUndefined();
  });

  it("allows omitted description/images so model defaults remain authoritative", () => {
    const payload = validCreate();
    delete payload.description;
    delete payload.images;
    const result = createFrameSchema.validate(payload);
    expect(result.error).toBeUndefined();
    expect(result.value).not.toHaveProperty("description");
    expect(result.value).not.toHaveProperty("images");
  });

  it("strips unknown create fields and client status by middleware convention", () => {
    const result = createFrameSchema.validate(
      validCreate({ status: "inactive", price: 100, slug: "classic" }),
      { stripUnknown: true },
    );
    expect(result.error).toBeUndefined();
    expect(result.value).not.toHaveProperty("status");
    expect(result.value).not.toHaveProperty("price");
    expect(result.value).not.toHaveProperty("slug");
  });

  it("accepts each mutable information field in update", () => {
    for (const payload of [
      { name: "Updated" },
      { description: "Updated description" },
      { brandId },
      { categoryId },
      { shape: "oval" },
      { material: "metal" },
      { gender: "women" },
      { faceShapes: ["square"] },
      { images: [] },
    ]) {
      expect(updateFrameSchema.validate(payload).error).toBeUndefined();
    }
  });

  it("rejects an empty or unknown-only information update", () => {
    expect(updateFrameSchema.validate({}).error).toBeDefined();
    expect(
      updateFrameSchema.validate({ unsupported: true }, { stripUnknown: true }).error,
    ).toBeDefined();
  });

  it.each(["status", "_id", "createdAt", "updatedAt"])(
    "rejects forbidden information-update field %s rather than stripping it",
    (field) => {
      const result = updateFrameSchema.validate(
        { name: "Updated", [field]: "value" },
        { stripUnknown: true },
      );
      expect(result.error).toBeDefined();
      expect(result.value).toHaveProperty(field);
    },
  );

  it("strips unrelated fields from an otherwise valid information update", () => {
    const result = updateFrameSchema.validate(
      { name: "  Updated  ", unsupported: true },
      { stripUnknown: true },
    );
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({ name: "Updated" });
  });

  it.each(["active", "inactive"])("accepts status update %s", (status) => {
    expect(updateFrameStatusSchema.validate({ status })).toEqual({ value: { status } });
  });

  it.each(["archived", "ACTIVE", "", 1, true])("rejects invalid status update %#", (status) => {
    expect(updateFrameStatusSchema.validate({ status }).error).toBeDefined();
  });

  it("requires status and strips unrelated status-update fields", () => {
    expect(updateFrameStatusSchema.validate({}).error).toBeDefined();
    const result = updateFrameStatusSchema.validate(
      { status: "active", name: "Ignored" },
      { stripUnknown: true },
    );
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({ status: "active" });
  });
});
