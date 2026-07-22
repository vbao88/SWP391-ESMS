import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Brand } from "../src/models/Brand.js";
import { Lens } from "../src/models/Lens.js";
import { LensOption } from "../src/models/LensOption.js";
import {
  clearTestCollections,
  connectTestDatabase,
  disconnectTestDatabase,
} from "./helpers/database.js";

let lens;
let secondLens;
let brandId;

function validLens(name) {
  return {
    name,
    brandId,
    visionType: "single_vision",
    refractiveIndex: "1.60",
    basePrice: 1000000,
  };
}

function validOption(overrides = {}) {
  return {
    lensId: lens._id,
    type: "coating",
    value: "  Anti   Reflective  ",
    ...overrides,
  };
}

const models = [LensOption, Lens, Brand];

beforeAll(async () => {
  await connectTestDatabase();
  await Promise.all(models.map((Model) => Model.init()));
});

beforeEach(async () => {
  await clearTestCollections(models);
  brandId = (await Brand.create({ name: "LensOption Test Brand" }))._id;
  [lens, secondLens] = await Promise.all([
    Lens.create(validLens("First Lens")),
    Lens.create(validLens("Second Lens")),
  ]);
});

afterAll(async () => {
  await clearTestCollections(models);
  await disconnectTestDatabase();
});

describe("LensOption model contract", () => {
  it("creates exact fields, derives normalized value, applies defaults, and timestamps", async () => {
    const option = await LensOption.create(validOption());
    expect(option.toObject()).toMatchObject({
      lensId: lens._id,
      type: "coating",
      value: "Anti   Reflective",
      valueNormalized: "anti reflective",
      priceAdjustment: 0,
      status: "active",
    });
    expect(option.createdAt).toBeInstanceOf(Date);
    expect(option.updatedAt).toBeInstanceOf(Date);
    expect(Object.keys(option.toObject()).sort()).toEqual(
      [
        "__v", "_id", "createdAt", "lensId", "priceAdjustment", "status", "type",
        "updatedAt", "value", "valueNormalized",
      ].sort(),
    );
  });

  it.each(["lensId", "type", "value"])("requires %s", async (field) => {
    const payload = validOption();
    delete payload[field];
    await expect(LensOption.create(payload)).rejects.toThrow();
  });

  it("rejects a blank value", async () => {
    await expect(LensOption.create(validOption({ value: "   " }))).rejects.toThrow();
  });

  it("uses Lens ref metadata and requires an existing Lens", async () => {
    expect(LensOption.schema.path("lensId").options.ref).toBe("Lens");
    await expect(LensOption.create(validOption())).resolves.toBeDefined();
    await expect(
      LensOption.create(validOption({ lensId: new mongoose.Types.ObjectId() })),
    ).rejects.toThrow("Lens does not exist");
    await expect(LensOption.create(validOption({ lensId: "invalid" }))).rejects.toThrow();
  });

  it.each(["coating", "tint"])("accepts type %s", async (type) => {
    expect((await LensOption.create(validOption({ type }))).type).toBe(type);
  });

  it("rejects an invalid type", async () => {
    await expect(LensOption.create(validOption({ type: "material" }))).rejects.toThrow();
  });

  it.each([-500000, -1, 0, 1, 500000])(
    "accepts signed integer priceAdjustment %s",
    async (priceAdjustment) => {
      expect((await LensOption.create(validOption({ priceAdjustment }))).priceAdjustment).toBe(
        priceAdjustment,
      );
    },
  );

  it("rejects fractional priceAdjustment", async () => {
    await expect(LensOption.create(validOption({ priceAdjustment: 1.5 }))).rejects.toThrow();
  });

  it.each(["active", "inactive"])("accepts status %s", async (status) => {
    expect((await LensOption.create(validOption({ status }))).status).toBe(status);
  });

  it("rejects invalid status", async () => {
    await expect(LensOption.create(validOption({ status: "archived" }))).rejects.toThrow();
  });

  it("keeps lensId and type immutable after creation", async () => {
    const option = await LensOption.create(validOption());
    option.lensId = secondLens._id;
    option.type = "tint";
    await option.save();
    const stored = await LensOption.findById(option._id);
    expect(stored.lensId).toEqual(lens._id);
    expect(stored.type).toBe("coating");
  });

  it("keeps valueNormalized synchronized and ignores supplied derived values", async () => {
    const option = await LensOption.create(validOption({ valueNormalized: "wrong" }));
    expect(option.valueNormalized).toBe("anti reflective");

    option.value = "  Chống   Ánh Sáng Xanh  ";
    await option.save();
    expect(option.value).toBe("Chống   Ánh Sáng Xanh");
    expect(option.valueNormalized).toBe("chống ánh sáng xanh");

    await LensOption.findByIdAndUpdate(
      option._id,
      { value: "  Premium   Coating  " },
      { runValidators: true },
    );
    const updated = await LensOption.findById(option._id);
    expect(updated.value).toBe("Premium   Coating");
    expect(updated.valueNormalized).toBe("premium coating");
  });

  it("enforces normalized value uniqueness within one Lens and type", async () => {
    await LensOption.create(validOption({ value: "Blue Light" }));
    await expect(
      LensOption.create(validOption({ value: "  blue   light  " })),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("allows the same normalized value for a different type or Lens", async () => {
    await LensOption.create(validOption({ value: "Blue Light" }));
    await expect(
      LensOption.create(validOption({ type: "tint", value: "blue light" })),
    ).resolves.toBeDefined();
    await expect(
      LensOption.create(
        validOption({ lensId: secondLens._id, value: " blue light " }),
      ),
    ).resolves.toBeDefined();
  });

  it("declares exactly one required unique index", () => {
    expect(LensOption.schema.indexes()).toEqual([
      [{ lensId: 1, type: 1, valueNormalized: 1 }, { unique: true }],
    ]);
  });

  it("does not persist unauthorized fields", async () => {
    const option = await LensOption.create(
      validOption({ inventory: 1, compatibility: {}, sku: "NO-SKU", metadata: {} }),
    );
    for (const field of ["inventory", "compatibility", "sku", "metadata"]) {
      expect(option.toObject()).not.toHaveProperty(field);
    }
  });
});
