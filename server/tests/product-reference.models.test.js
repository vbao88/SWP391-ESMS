import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Brand } from "../src/models/Brand.js";
import { Category } from "../src/models/Category.js";
import {
  clearTestCollections,
  connectTestDatabase,
  disconnectTestDatabase,
} from "./helpers/database.js";

beforeAll(async () => {
  await connectTestDatabase();
  await Promise.all([Brand.init(), Category.init()]);
});

beforeEach(async () => clearTestCollections([Brand, Category]));

afterAll(async () => {
  await clearTestCollections([Brand, Category]);
  await disconnectTestDatabase();
});

describe.each([
  ["Brand", Brand],
  ["Category", Category],
])("%s model contract", (_label, Model) => {
  it("stores the exact fields, trims name, defaults status, and adds timestamps", async () => {
    const document = await Model.create({ name: "  Classic  " });
    expect(document.toObject()).toMatchObject({ name: "Classic", status: "active" });
    expect(document.createdAt).toBeInstanceOf(Date);
    expect(document.updatedAt).toBeInstanceOf(Date);
    expect(Object.keys(document.toObject()).sort()).toEqual(
      ["__v", "_id", "createdAt", "name", "status", "updatedAt"].sort(),
    );
  });

  it("requires a non-empty name", async () => {
    await expect(Model.create({})).rejects.toThrow();
    await expect(Model.create({ name: "   " })).rejects.toThrow();
  });

  it.each(["active", "inactive"])("accepts status %s", async (status) => {
    expect((await Model.create({ name: `Name ${status}`, status })).status).toBe(status);
  });

  it("rejects an invalid status", async () => {
    await expect(Model.create({ name: "Invalid", status: "archived" })).rejects.toThrow();
  });

  it("enforces case-insensitive global name uniqueness in MongoDB", async () => {
    await Model.create({ name: "  Ray Ban  " });
    await expect(Model.create({ name: "ray ban" })).rejects.toMatchObject({ code: 11000 });
  });

  it("declares one case-insensitive unique name index without duplicates", () => {
    expect(Model.schema.indexes()).toEqual([
      [
        { name: 1 },
        { unique: true, collation: { locale: "en", strength: 2 } },
      ],
    ]);
  });
});
