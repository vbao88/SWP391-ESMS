import { describe, expect, it } from "vitest";
import {
  createLensSchema,
  updateLensSchema,
  updateLensStatusSchema,
} from "../src/validations/lens.validation.js";

const brandId = "507f1f77bcf86cd799439011";

function validCreate(overrides = {}) {
  return {
    name: "  Clear Vision Lens  ",
    description: "  Premium lens  ",
    brandId,
    visionType: "single_vision",
    refractiveIndex: "1.60",
    features: ["blue_light", "photochromic"],
    basePrice: 1200000,
    ...overrides,
  };
}

function validImage(overrides = {}) {
  return {
    url: "https://cdn.example.com/lens.jpg",
    altText: "Lens image",
    sortOrder: 0,
    isPrimary: true,
    ...overrides,
  };
}

describe("Lens validation foundation", () => {
  it("accepts and normalizes a valid create payload", () => {
    const result = createLensSchema.validate(validCreate());
    expect(result.error).toBeUndefined();
    expect(result.value).toMatchObject({
      name: "Clear Vision Lens",
      description: "Premium lens",
      refractiveIndex: "1.60",
      basePrice: 1200000,
    });
    expect(result.value).not.toHaveProperty("price");
  });

  it.each(["name", "brandId", "visionType", "refractiveIndex", "basePrice"])(
    "rejects create without required %s",
    (field) => {
      const payload = validCreate();
      delete payload[field];
      expect(createLensSchema.validate(payload).error).toBeDefined();
    },
  );

  it("allows omitted optional/defaulted fields", () => {
    const payload = validCreate();
    delete payload.description;
    delete payload.features;
    const result = createLensSchema.validate(payload);
    expect(result.error).toBeUndefined();
    expect(result.value).not.toHaveProperty("description");
    expect(result.value).not.toHaveProperty("features");
  });

  it("rejects malformed Brand ObjectId", () => {
    expect(createLensSchema.validate(validCreate({ brandId: "invalid" })).error).toBeDefined();
  });

  it.each(["non_prescription", "single_vision"])("accepts visionType %s", (visionType) => {
    expect(createLensSchema.validate(validCreate({ visionType })).error).toBeUndefined();
  });

  it.each(["progressive", "SINGLE_VISION", 1])("rejects invalid visionType %#", (visionType) => {
    expect(createLensSchema.validate(validCreate({ visionType })).error).toBeDefined();
  });

  it.each(["1.50", "1.56", "1.60", "1.67"])("accepts refractiveIndex %s", (value) => {
    expect(createLensSchema.validate(validCreate({ refractiveIndex: value })).error).toBeUndefined();
  });

  it.each([1.6, "1.6", "1.74"])("rejects refractiveIndex %#", (refractiveIndex) => {
    expect(createLensSchema.validate(validCreate({ refractiveIndex })).error).toBeDefined();
  });

  it("accepts unique controlled features and rejects invalid or duplicate values", () => {
    expect(createLensSchema.validate(validCreate({ features: [] })).error).toBeUndefined();
    expect(createLensSchema.validate(validCreate({ features: ["polarized"] })).error).toBeDefined();
    expect(
      createLensSchema.validate(validCreate({ features: ["blue_light", "blue_light"] })).error,
    ).toBeDefined();
  });

  it("validates embedded Media and rejects multiple primary images", () => {
    expect(
      createLensSchema.validate(validCreate({ images: [validImage()] })).error,
    ).toBeUndefined();
    expect(
      createLensSchema.validate(
        validCreate({ images: [validImage({ isPrimary: "true" })] }),
      ).error,
    ).toBeDefined();
    expect(
      createLensSchema.validate(
        validCreate({
          images: [validImage(), validImage({ url: "https://cdn.example.com/second.jpg" })],
        }),
      ).error,
    ).toBeDefined();
  });

  it.each([0, 1, 2000000])("accepts integer basePrice %s", (basePrice) => {
    expect(createLensSchema.validate(validCreate({ basePrice })).error).toBeUndefined();
  });

  it.each([-1, 1.5, "1000"])("rejects invalid basePrice %#", (basePrice) => {
    expect(createLensSchema.validate(validCreate({ basePrice })).error).toBeDefined();
  });

  it.each(["_id", "createdAt", "updatedAt"])(
    "rejects protected create field %s rather than stripping it",
    (field) => {
      const result = createLensSchema.validate(
        validCreate({ [field]: "protected" }),
        { stripUnknown: true },
      );
      expect(result.error).toBeDefined();
      expect(result.value).toHaveProperty(field);
    },
  );

  it("strips price, status, and unrelated/deferred fields by middleware convention", () => {
    const result = createLensSchema.validate(
      validCreate({ price: 10, status: "inactive", supportedRange: {}, slug: "lens" }),
      { stripUnknown: true },
    );
    expect(result.error).toBeUndefined();
    for (const field of ["price", "status", "supportedRange", "slug"]) {
      expect(result.value).not.toHaveProperty(field);
    }
  });

  it("accepts every mutable information field", () => {
    for (const payload of [
      { name: "Updated" },
      { description: "Updated description" },
      { brandId },
      { visionType: "non_prescription" },
      { refractiveIndex: "1.67" },
      { features: [] },
      { basePrice: 0 },
      { images: [] },
    ]) {
      expect(updateLensSchema.validate(payload).error).toBeUndefined();
    }
  });

  it("rejects empty and unknown-only effective updates", () => {
    expect(updateLensSchema.validate({}).error).toBeDefined();
    expect(updateLensSchema.validate({ unsupported: true }, { stripUnknown: true }).error).toBeDefined();
  });

  it.each(["status", "_id", "createdAt", "updatedAt"])(
    "rejects forbidden information-update field %s",
    (field) => {
      const result = updateLensSchema.validate(
        { name: "Updated", [field]: "protected" },
        { stripUnknown: true },
      );
      expect(result.error).toBeDefined();
      expect(result.value).toHaveProperty(field);
    },
  );

  it("strips unrelated fields from a valid information update", () => {
    const result = updateLensSchema.validate(
      { name: "  Updated  ", price: 10 },
      { stripUnknown: true },
    );
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({ name: "Updated" });
  });

  it.each(["active", "inactive"])("accepts status update %s", (status) => {
    expect(updateLensStatusSchema.validate({ status })).toEqual({ value: { status } });
  });

  it.each(["archived", "ACTIVE", "", 1])("rejects invalid status %#", (status) => {
    expect(updateLensStatusSchema.validate({ status }).error).toBeDefined();
  });

  it("requires status and strips information fields from status update", () => {
    expect(updateLensStatusSchema.validate({}).error).toBeDefined();
    const result = updateLensStatusSchema.validate(
      { status: "active", basePrice: 0 },
      { stripUnknown: true },
    );
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({ status: "active" });
  });
});
