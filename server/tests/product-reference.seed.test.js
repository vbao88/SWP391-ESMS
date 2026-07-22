import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Branch } from "../src/models/Branch.js";
import { Brand } from "../src/models/Brand.js";
import { Category } from "../src/models/Category.js";
import { User } from "../src/models/User.js";
import {
  productReferenceSeedData,
  seedProductReferences,
} from "../src/seeds/product-reference.seed.js";
import {
  clearTestCollections,
  connectTestDatabase,
  disconnectTestDatabase,
} from "./helpers/database.js";

const models = [Brand, Category, Branch, User];

beforeAll(async () => {
  await connectTestDatabase();
  await Promise.all(models.map((Model) => Model.init()));
});

beforeEach(async () => {
  vi.restoreAllMocks();
  await clearTestCollections(models);
});

afterAll(async () => {
  vi.restoreAllMocks();
  await clearTestCollections(models);
  await disconnectTestDatabase();
});

describe("Product reference seed foundation", () => {
  it("defines exactly the approved runtime dataset without case-insensitive duplicates", () => {
    expect(productReferenceSeedData).toEqual({
      brands: [{ name: "Ray-Ban" }, { name: "Oakley" }],
      categories: [
        { name: "Eyeglasses" },
        { name: "Sunglasses" },
        { name: "Blue Light Glasses" },
      ],
    });

    for (const records of [
      productReferenceSeedData.brands,
      productReferenceSeedData.categories,
    ]) {
      const normalizedNames = records.map(({ name }) => name.toLocaleLowerCase("en"));
      expect(new Set(normalizedNames).size).toBe(records.length);
    }
  });

  it("creates the authoritative active records on the first runtime seed", async () => {
    await seedProductReferences();

    expect(
      await Brand.find({}, { _id: 0, name: 1, status: 1 }).sort({ name: 1 }).lean(),
    ).toEqual([
      { name: "Oakley", status: "active" },
      { name: "Ray-Ban", status: "active" },
    ]);
    expect(
      await Category.find({}, { _id: 0, name: 1, status: 1 }).sort({ name: 1 }).lean(),
    ).toEqual([
      { name: "Blue Light Glasses", status: "active" },
      { name: "Eyeglasses", status: "active" },
      { name: "Sunglasses", status: "active" },
    ]);
  });

  it("is idempotent across repeated runs", async () => {
    await seedProductReferences();
    await seedProductReferences();
    expect(await Brand.countDocuments()).toBe(2);
    expect(await Category.countDocuments()).toBe(3);
  });

  it("fills partial data and preserves existing inactive seed records", async () => {
    await Brand.create({ name: "Ray-Ban", status: "inactive" });
    await Category.create({ name: "Eyeglasses", status: "inactive" });
    await Category.create({ name: "Sunglasses" });
    await seedProductReferences();

    expect(await Brand.countDocuments()).toBe(2);
    expect(await Category.countDocuments()).toBe(3);
    expect((await Brand.findOne({ name: "Ray-Ban" })).status).toBe("inactive");
    expect((await Category.findOne({ name: "Eyeglasses" })).status).toBe("inactive");
    expect(await Brand.exists({ name: "Oakley", status: "active" })).not.toBeNull();
    expect(
      await Category.exists({ name: "Blue Light Glasses", status: "active" }),
    ).not.toBeNull();
  });

  it("recognizes differently-cased seed natural keys without duplicates or status changes", async () => {
    await Brand.create({ name: "ray-ban", status: "inactive" });
    await Brand.create({ name: "OAKLEY" });
    await Category.create({ name: "EYEGLASSES", status: "inactive" });
    await Category.create({ name: "sunglasses" });
    await Category.create({ name: "BLUE LIGHT GLASSES" });

    await seedProductReferences();

    expect(await Brand.countDocuments()).toBe(2);
    expect(await Category.countDocuments()).toBe(3);
    expect((await Brand.findOne({ name: "ray-ban" })).status).toBe("inactive");
    expect((await Category.findOne({ name: "EYEGLASSES" })).status).toBe("inactive");
  });

  it("does not delete non-seed references or alter User/Branch data", async () => {
    const branch = await Branch.create({
      code: "SAFE",
      name: "Safe Branch",
      district: "District",
      address: "Address",
    });
    const user = await User.create({
      fullName: "Safe User",
      email: "safe@example.com",
      passwordHash: "hash",
      role: "customer",
    });
    await Brand.create({ name: "Custom Brand" });
    await Category.create({ name: "Custom Category" });

    await seedProductReferences();

    expect(await Brand.countDocuments()).toBe(3);
    expect(await Category.countDocuments()).toBe(4);
    expect(await Branch.findById(branch._id)).not.toBeNull();
    expect(await User.findById(user._id)).not.toBeNull();
  });

  it("propagates persistence errors", async () => {
    vi.spyOn(Brand, "findOneAndUpdate").mockRejectedValueOnce(new Error("seed write failed"));
    await expect(seedProductReferences()).rejects.toThrow("seed write failed");
  });

  it("validates all input before writing and rejects malformed datasets", async () => {
    await expect(
      seedProductReferences({
        brands: [{ name: "Would Otherwise Be Written" }],
        categories: [{ name: "   " }],
      }),
    ).rejects.toThrow();
    expect(await Brand.countDocuments()).toBe(0);
    expect(await Category.countDocuments()).toBe(0);

    await expect(
      seedProductReferences({ brands: null, categories: [] }),
    ).rejects.toThrow("Brand seed data must be an array");
  });

  it("handles case-insensitive duplicates within input deterministically", async () => {
    await seedProductReferences({
      brands: [
        { name: "Duplicate Seed", status: "inactive" },
        { name: "duplicate seed", status: "active" },
      ],
      categories: [],
    });

    expect(await Brand.countDocuments()).toBe(1);
    expect((await Brand.findOne()).toObject()).toMatchObject({
      name: "Duplicate Seed",
      status: "inactive",
    });
  });
});
