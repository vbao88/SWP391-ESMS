import { describe, expect, it } from "vitest";
import {
  createLensOptionSchema,
  updateLensOptionSchema,
  updateLensOptionStatusSchema,
} from "../src/validations/lens-option.validation.js";

const lensId = "507f1f77bcf86cd799439011";

function validCreate(overrides = {}) {
  return {
    lensId,
    type: "coating",
    value: "  Anti   Reflective  ",
    ...overrides,
  };
}

describe("LensOption validation foundation", () => {
  it("accepts a valid create payload and trims the display value", () => {
    const result = createLensOptionSchema.validate(validCreate());
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({
      lensId,
      type: "coating",
      value: "Anti   Reflective",
    });
  });

  it.each(["lensId", "type", "value"])("rejects create without required %s", (field) => {
    const payload = validCreate();
    delete payload[field];
    expect(createLensOptionSchema.validate(payload).error).toBeDefined();
  });

  it("rejects malformed ObjectId and blank value", () => {
    expect(createLensOptionSchema.validate(validCreate({ lensId: "invalid" })).error).toBeDefined();
    expect(createLensOptionSchema.validate(validCreate({ value: "   " })).error).toBeDefined();
  });

  it.each(["coating", "tint"])("accepts type %s", (type) => {
    expect(createLensOptionSchema.validate(validCreate({ type })).error).toBeUndefined();
  });

  it.each(["material", "COATING", 1])("rejects invalid type %#", (type) => {
    expect(createLensOptionSchema.validate(validCreate({ type })).error).toBeDefined();
  });

  it.each([-500000, -1, 0, 1, 500000])(
    "accepts signed integer priceAdjustment %s",
    (priceAdjustment) => {
      expect(
        createLensOptionSchema.validate(validCreate({ priceAdjustment })).error,
      ).toBeUndefined();
    },
  );

  it.each([1.5, "1000"])("rejects invalid priceAdjustment %#", (priceAdjustment) => {
    expect(createLensOptionSchema.validate(validCreate({ priceAdjustment })).error).toBeDefined();
  });

  it.each(["valueNormalized", "_id", "createdAt", "updatedAt"])(
    "rejects protected create field %s rather than stripping it",
    (field) => {
      const result = createLensOptionSchema.validate(
        validCreate({ [field]: "protected" }),
        { stripUnknown: true },
      );
      expect(result.error).toBeDefined();
      expect(result.value).toHaveProperty(field);
    },
  );

  it("strips status and unrelated fields by middleware convention", () => {
    const result = createLensOptionSchema.validate(
      validCreate({ status: "inactive", inventory: 1, compatibility: {} }),
      { stripUnknown: true },
    );
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({ lensId, type: "coating", value: "Anti   Reflective" });
  });

  it("accepts each mutable information field", () => {
    expect(updateLensOptionSchema.validate({ value: "Updated" }).error).toBeUndefined();
    expect(updateLensOptionSchema.validate({ priceAdjustment: -1000 }).error).toBeUndefined();
  });

  it("rejects empty and unknown-only effective updates", () => {
    expect(updateLensOptionSchema.validate({}).error).toBeDefined();
    expect(
      updateLensOptionSchema.validate({ unsupported: true }, { stripUnknown: true }).error,
    ).toBeDefined();
  });

  it.each([
    "lensId", "type", "valueNormalized", "status", "_id", "createdAt", "updatedAt",
  ])("rejects forbidden information-update field %s", (field) => {
    const result = updateLensOptionSchema.validate(
      { value: "Updated", [field]: "protected" },
      { stripUnknown: true },
    );
    expect(result.error).toBeDefined();
    expect(result.value).toHaveProperty(field);
  });

  it("strips unrelated fields from a valid information update", () => {
    const result = updateLensOptionSchema.validate(
      { value: "  Updated  ", inventory: 1 },
      { stripUnknown: true },
    );
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({ value: "Updated" });
  });

  it.each(["active", "inactive"])("accepts status update %s", (status) => {
    expect(updateLensOptionStatusSchema.validate({ status })).toEqual({ value: { status } });
  });

  it.each(["archived", "ACTIVE", "", 1])("rejects invalid status %#", (status) => {
    expect(updateLensOptionStatusSchema.validate({ status }).error).toBeDefined();
  });

  it("requires status and strips information fields from status update", () => {
    expect(updateLensOptionStatusSchema.validate({}).error).toBeDefined();
    const result = updateLensOptionStatusSchema.validate(
      { status: "active", value: "Ignored" },
      { stripUnknown: true },
    );
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({ status: "active" });
  });
});
