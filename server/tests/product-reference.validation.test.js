import { describe, expect, it } from "vitest";
import {
  createBrandSchema,
  createCategorySchema,
  updateBrandSchema,
  updateBrandStatusSchema,
  updateCategorySchema,
  updateCategoryStatusSchema,
} from "../src/validations/product-reference.validation.js";

describe.each([
  ["Brand", createBrandSchema, updateBrandSchema, updateBrandStatusSchema],
  ["Category", createCategorySchema, updateCategorySchema, updateCategoryStatusSchema],
])("%s validation foundation", (_label, createSchema, updateSchema, statusSchema) => {
  it("accepts and trims a valid create payload", () => {
    expect(createSchema.validate({ name: "  Classic  " })).toEqual({
      value: { name: "Classic" },
    });
  });

  it.each([{}, { name: "   " }, { name: 42 }])("rejects invalid create payload %#", (payload) => {
    expect(createSchema.validate(payload).error).toBeDefined();
  });

  it("uses the existing middleware convention to strip unknown create fields", () => {
    const result = createSchema.validate(
      { name: "Classic", unsupported: true },
      { stripUnknown: true },
    );
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({ name: "Classic" });
  });

  it("strips client-supplied create status so the model default remains authoritative", () => {
    const result = createSchema.validate(
      { name: "Classic", status: "inactive" },
      { stripUnknown: true },
    );
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({ name: "Classic" });
  });

  it("accepts name-only updates and rejects empty updates", () => {
    expect(updateSchema.validate({ name: "  Modern  " }).value).toEqual({ name: "Modern" });
    expect(updateSchema.validate({}).error).toBeDefined();
  });

  it.each(["status", "_id", "createdAt", "updatedAt"])(
    "forbids update of %s through information validation",
    (field) => {
      expect(updateSchema.validate({ name: "Modern", [field]: "value" }).error).toBeDefined();
    },
  );

  it("strips unknown information-update fields but rejects an unknown-only update", () => {
    const mixed = updateSchema.validate(
      { name: "Modern", unsupported: true },
      { stripUnknown: true },
    );
    expect(mixed.error).toBeUndefined();
    expect(mixed.value).toEqual({ name: "Modern" });
    expect(
      updateSchema.validate({ unsupported: true }, { stripUnknown: true }).error,
    ).toBeDefined();
  });

  it.each(["active", "inactive"])("accepts status-only update value %s", (status) => {
    expect(statusSchema.validate({ status })).toEqual({ value: { status } });
  });

  it.each(["archived", "ACTIVE", "", 1])("rejects invalid status update value %#", (status) => {
    expect(statusSchema.validate({ status }).error).toBeDefined();
  });

  it("requires status and strips unrelated status-update fields by middleware convention", () => {
    expect(statusSchema.validate({}).error).toBeDefined();
    const result = statusSchema.validate(
      { status: "active", unsupported: true },
      { stripUnknown: true },
    );
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({ status: "active" });
  });
});
