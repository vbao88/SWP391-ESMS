import { describe, expect, it } from "vitest";
import {
  createFrameVariantSchema,
  updateFrameVariantSchema,
  updateFrameVariantStatusSchema,
} from "../src/validations/frame-variant.validation.js";

const frameId = "507f1f77bcf86cd799439011";

function validCreate(overrides = {}) {
  return {
    frameId,
    sku: "  fv_black-m  ",
    color: "  Midnight   Black  ",
    size: "M",
    price: 1500000,
    ...overrides,
  };
}

describe("FrameVariant validation foundation", () => {
  it("accepts create and applies approved SKU/color normalization", () => {
    const result = createFrameVariantSchema.validate(validCreate());
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({
      frameId,
      sku: "FV_BLACK-M",
      color: "Midnight Black",
      size: "M",
      price: 1500000,
    });
  });

  it.each(["frameId", "sku", "color", "size", "price"])(
    "rejects create without required %s",
    (field) => {
      const payload = validCreate();
      delete payload[field];
      expect(createFrameVariantSchema.validate(payload).error).toBeDefined();
    },
  );

  it("rejects malformed ObjectId", () => {
    expect(createFrameVariantSchema.validate(validCreate({ frameId: "invalid" })).error).toBeDefined();
  });

  it.each(["AB", "-ABC", "A B", "A.B", `A${"B".repeat(64)}`])(
    "rejects invalid SKU %s",
    (sku) => expect(createFrameVariantSchema.validate(validCreate({ sku })).error).toBeDefined(),
  );

  it.each(["ABC", `A${"B".repeat(63)}`])("accepts SKU boundary %s", (sku) => {
    expect(createFrameVariantSchema.validate(validCreate({ sku })).error).toBeUndefined();
  });

  it.each([0, 1, 2000000])("accepts integer price %s", (price) => {
    expect(createFrameVariantSchema.validate(validCreate({ price })).error).toBeUndefined();
  });

  it.each([-1, 1.5, "1000"])("rejects invalid price %#", (price) => {
    expect(createFrameVariantSchema.validate(validCreate({ price })).error).toBeDefined();
  });

  it.each(["S", "M", "L"])("accepts size %s", (size) => {
    expect(createFrameVariantSchema.validate(validCreate({ size })).error).toBeUndefined();
  });

  it.each(["XS", "m", "XL"])("rejects size %s", (size) => {
    expect(createFrameVariantSchema.validate(validCreate({ size })).error).toBeDefined();
  });

  it("trims/collapses color and rejects blank color", () => {
    expect(createFrameVariantSchema.validate(validCreate()).value.color).toBe("Midnight Black");
    expect(createFrameVariantSchema.validate(validCreate({ color: "   " })).error).toBeDefined();
  });

  it.each(["colorNormalized", "sizeNormalized", "_id", "createdAt", "updatedAt"])(
    "rejects protected create field %s rather than stripping it",
    (field) => {
      const result = createFrameVariantSchema.validate(
        validCreate({ [field]: "protected" }),
        { stripUnknown: true },
      );
      expect(result.error).toBeDefined();
      expect(result.value).toHaveProperty(field);
    },
  );

  it("strips status and unrelated create fields by middleware convention", () => {
    const result = createFrameVariantSchema.validate(
      validCreate({ status: "inactive", inventoryQuantity: 10 }),
      { stripUnknown: true },
    );
    expect(result.error).toBeUndefined();
    expect(result.value).not.toHaveProperty("status");
    expect(result.value).not.toHaveProperty("inventoryQuantity");
  });

  it("accepts each mutable information field", () => {
    for (const payload of [
      { color: "  Pearl   White " },
      { size: "L" },
      { price: 0 },
      { images: [] },
    ]) {
      expect(updateFrameVariantSchema.validate(payload).error).toBeUndefined();
    }
  });

  it("rejects empty and unknown-only effective updates", () => {
    expect(updateFrameVariantSchema.validate({}).error).toBeDefined();
    expect(
      updateFrameVariantSchema.validate({ unsupported: true }, { stripUnknown: true }).error,
    ).toBeDefined();
  });

  it.each([
    "frameId", "sku", "status", "colorNormalized", "sizeNormalized", "_id", "createdAt", "updatedAt",
  ])("rejects forbidden information-update field %s", (field) => {
    const result = updateFrameVariantSchema.validate(
      { price: 0, [field]: "protected" },
      { stripUnknown: true },
    );
    expect(result.error).toBeDefined();
    expect(result.value).toHaveProperty(field);
  });

  it("strips unrelated fields from a valid information update", () => {
    const result = updateFrameVariantSchema.validate(
      { color: "  Pearl   White ", unsupported: true },
      { stripUnknown: true },
    );
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({ color: "Pearl White" });
  });

  it.each(["active", "inactive"])("accepts status update %s", (status) => {
    expect(updateFrameVariantStatusSchema.validate({ status })).toEqual({ value: { status } });
  });

  it.each(["archived", "ACTIVE", "", 1])("rejects invalid status %#", (status) => {
    expect(updateFrameVariantStatusSchema.validate({ status }).error).toBeDefined();
  });

  it("requires status and strips unrelated status-update fields", () => {
    expect(updateFrameVariantStatusSchema.validate({}).error).toBeDefined();
    const result = updateFrameVariantStatusSchema.validate(
      { status: "active", price: 0 },
      { stripUnknown: true },
    );
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({ status: "active" });
  });
});
