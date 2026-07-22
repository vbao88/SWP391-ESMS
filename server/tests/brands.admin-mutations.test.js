import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { env } from "../src/config/env.js";
import { Brand } from "../src/models/Brand.js";
import { Frame } from "../src/models/Frame.js";
import { Lens } from "../src/models/Lens.js";
import { User } from "../src/models/User.js";
import { createRefreshToken, signAccessToken } from "../src/utils/token.js";
import { clearTestCollections, connectTestDatabase, disconnectTestDatabase } from "./helpers/database.js";

const ADMIN_FIELDS = ["createdAt", "id", "name", "status", "updatedAt"];
let sequence = 0;

function userInput(overrides = {}) {
  sequence += 1;
  return {
    fullName: "Brand Mutation User",
    email: `brand-mutation-${sequence}@example.com`,
    passwordHash: "test-password-hash",
    role: "administrator",
    adminLevel: "super_admin",
    status: "active",
    ...overrides,
  };
}

function tokenFor(user, overrides = {}) {
  return signAccessToken({
    _id: user._id,
    role: user.role,
    adminLevel: user.adminLevel,
    branchId: user.branchId,
    ...overrides,
  });
}

async function superAdmin() {
  const user = await User.create(userInput());
  return { user, token: tokenFor(user) };
}

function authorized(method, path, token, body) {
  return request(app)[method](path).set("Authorization", `Bearer ${token}`).send(body);
}

function expectAdminBrand(data) {
  expect(Object.keys(data).sort()).toEqual(ADMIN_FIELDS);
  expect(data.id).toMatch(/^[a-f\d]{24}$/i);
  expect(new Date(data.createdAt).toISOString()).toBe(data.createdAt);
  expect(new Date(data.updatedAt).toISOString()).toBe(data.updatedAt);
  expect(data).not.toHaveProperty("_id");
  expect(data).not.toHaveProperty("__v");
}

function expectValidation(response) {
  expect(response.status).toBe(400);
  expect(response.body.message).toBe("Validation failed");
  expect(Array.isArray(response.body.details)).toBe(true);
}

beforeAll(async () => {
  await connectTestDatabase();
  await Promise.all([Brand.init(), User.init()]);
});

beforeEach(async () => {
  vi.restoreAllMocks();
  sequence = 0;
  await clearTestCollections([Frame, Lens, Brand, User]);
});

afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  await clearTestCollections([Frame, Lens, Brand, User]);
  await disconnectTestDatabase();
});

describe("POST /api/v1/brands", () => {
  it("creates a trimmed active Brand and returns the exact Admin DTO", async () => {
    const { token } = await superAdmin();
    const response = await authorized("post", "/api/v1/brands", token, { name: "  Zeiss  " });

    expect(response.status).toBe(201);
    expect(response.body.message).toBe("Brand created successfully.");
    expectAdminBrand(response.body.data);
    expect(response.body.data).toMatchObject({ name: "Zeiss", status: "active" });
    expect(await Brand.countDocuments()).toBe(1);
    expect((await Brand.findById(response.body.data.id)).name).toBe("Zeiss");
  });

  it.each([{}, { name: "" }, { name: "   " }, { name: 42 }])(
    "rejects invalid create body %#",
    async (body) => {
      const { token } = await superAdmin();
      expectValidation(await authorized("post", "/api/v1/brands", token, body));
      expect(await Brand.countDocuments()).toBe(0);
    },
  );

  it("uses the approved stripping convention for create status and unknown fields", async () => {
    const { token } = await superAdmin();
    const response = await authorized("post", "/api/v1/brands", token, {
      name: "Allowed",
      status: "inactive",
      unsupported: "hidden",
      _id: new mongoose.Types.ObjectId(),
      __v: 99,
    });
    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe("active");
    expect(JSON.stringify(response.body)).not.toContain("hidden");
  });

  it.each(["Ray Ban", "ray ban", "  Ray Ban  "])(
    "returns the exact conflict for duplicate name %s",
    async (name) => {
      await Brand.create({ name: "Ray Ban" });
      const { token } = await superAdmin();
      const response = await authorized("post", "/api/v1/brands", token, { name });
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ success: false, message: "Brand name already exists", details: null });
      expect(await Brand.countDocuments()).toBe(1);
    },
  );

  it("translates a duplicate-key race without leaking index metadata", async () => {
    const { token } = await superAdmin();
    vi.spyOn(Brand, "create").mockRejectedValueOnce({ code: 11000, keyPattern: { name: 1 }, message: "name_1 secret" });
    const response = await authorized("post", "/api/v1/brands", token, { name: "Race" });
    expect(response.status).toBe(409);
    expect(response.body.message).toBe("Brand name already exists");
    expect(response.body.details).toBeNull();
    expect(JSON.stringify({ message: response.body.message, details: response.body.details })).not.toContain("name_1");
  });
});

describe("PATCH /api/v1/brands/:brandId", () => {
  it.each(["active", "inactive"])("updates an %s Brand and trims its name", async (status) => {
    const brand = await Brand.create({ name: `Original ${status}`, status });
    const { token } = await superAdmin();
    const response = await authorized("patch", `/api/v1/brands/${brand._id}`, token, { name: "  Updated  " });
    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Brand updated successfully.");
    expectAdminBrand(response.body.data);
    expect(response.body.data).toMatchObject({ name: "Updated", status });
    expect((await Brand.findById(brand._id)).name).toBe("Updated");
  });

  it("allows an idempotent self-name update without duplicate conflict", async () => {
    const brand = await Brand.create({ name: "Self Name" });
    const { token } = await superAdmin();
    const response = await authorized("patch", `/api/v1/brands/${brand._id}`, token, { name: "  self name  " });
    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Brand updated successfully.");
  });

  it.each([
    ["invalid ObjectId", "invalid-id", { name: "Valid" }],
    ["empty body", null, {}],
    ["whitespace name", null, { name: "   " }],
    ["non-string name", null, { name: 1 }],
    ["supplied status", null, { name: "Valid", status: "inactive" }],
    ["unknown-only body", null, { unsupported: true }],
  ])("rejects %s", async (_label, suppliedId, body) => {
    const brand = await Brand.create({ name: "Original" });
    const { token } = await superAdmin();
    const response = await authorized("patch", `/api/v1/brands/${suppliedId ?? brand._id}`, token, body);
    expectValidation(response);
    expect((await Brand.findById(brand._id)).name).toBe("Original");
  });

  it("strips unknown fields when a valid name update is present", async () => {
    const brand = await Brand.create({ name: "Original" });
    const { token } = await superAdmin();
    const response = await authorized("patch", `/api/v1/brands/${brand._id}`, token, { name: "Updated", unsupported: "hidden" });
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain("hidden");
  });

  it("returns the controlled not-found contract", async () => {
    const { token } = await superAdmin();
    const response = await authorized("patch", `/api/v1/brands/${new mongoose.Types.ObjectId()}`, token, { name: "Unknown" });
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ success: false, message: "Brand not found", details: null });
  });

  it("rejects rename to another Brand case-insensitively without modifying the target", async () => {
    await Brand.create({ name: "Existing" });
    const target = await Brand.create({ name: "Target" });
    const { token } = await superAdmin();
    const response = await authorized("patch", `/api/v1/brands/${target._id}`, token, { name: "existing" });
    expect(response.status).toBe(409);
    expect(response.body.message).toBe("Brand name already exists");
    expect((await Brand.findById(target._id)).name).toBe("Target");
  });
});

describe("PATCH /api/v1/brands/:brandId/status", () => {
  it.each([
    ["active", "inactive"],
    ["inactive", "active"],
    ["active", "active"],
  ])("changes or idempotently keeps %s -> %s", async (current, requested) => {
    const brand = await Brand.create({ name: `Status ${current} ${requested}`, status: current });
    const { token } = await superAdmin();
    const response = await authorized("patch", `/api/v1/brands/${brand._id}/status`, token, { status: requested });
    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Brand status updated successfully.");
    expectAdminBrand(response.body.data);
    expect(response.body.data.status).toBe(requested);
    expect((await Brand.findById(brand._id)).status).toBe(requested);
  });

  it("changes only Brand status and does not cascade", async () => {
    const brand = await Brand.create({ name: "Parent" });
    const categoryId = new mongoose.Types.ObjectId();
    const frameId = new mongoose.Types.ObjectId();
    const lensId = new mongoose.Types.ObjectId();
    await Frame.collection.insertOne({ _id: frameId, name: "Frame", brandId: brand._id, categoryId, status: "active" });
    await Lens.collection.insertOne({ _id: lensId, name: "Lens", brandId: brand._id, status: "active" });
    const { token } = await superAdmin();
    expect((await authorized("patch", `/api/v1/brands/${brand._id}/status`, token, { status: "inactive" })).status).toBe(200);
    expect((await Frame.collection.findOne({ _id: frameId })).status).toBe("active");
    expect((await Lens.collection.findOne({ _id: lensId })).status).toBe("active");
  });

  it.each([
    ["invalid ObjectId", "invalid-id", { status: "inactive" }],
    ["missing status", null, {}],
    ["invalid status", null, { status: "archived" }],
  ])("rejects %s", async (_label, suppliedId, body) => {
    const brand = await Brand.create({ name: "Status Validation" });
    const { token } = await superAdmin();
    expectValidation(await authorized("patch", `/api/v1/brands/${suppliedId ?? brand._id}/status`, token, body));
    expect((await Brand.findById(brand._id)).status).toBe("active");
  });

  it("strips extra status fields by approved middleware convention", async () => {
    const brand = await Brand.create({ name: "Status Extra" });
    const { token } = await superAdmin();
    const response = await authorized("patch", `/api/v1/brands/${brand._id}/status`, token, { status: "inactive", extra: "hidden" });
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain("hidden");
  });

  it("returns the controlled not-found contract", async () => {
    const { token } = await superAdmin();
    const response = await authorized("patch", `/api/v1/brands/${new mongoose.Types.ObjectId()}/status`, token, { status: "inactive" });
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ success: false, message: "Brand not found", details: null });
  });
});

describe("Brand mutation authentication and authorization", () => {
  it.each([
    ["missing", undefined],
    ["malformed", "Basic credentials"],
  ])("returns Authentication required for %s Authorization before validation", async (_label, authorization) => {
    const pending = request(app).post("/api/v1/brands");
    if (authorization) pending.set("Authorization", authorization);
    const response = await pending.send({});
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Authentication required");
  });

  it.each([
    ["invalid", "not-a-token"],
    ["expired", jwt.sign({ userId: new mongoose.Types.ObjectId().toString(), role: "administrator", adminLevel: "super_admin", type: "access" }, env.jwtAccessSecret, { algorithm: "HS256", expiresIn: -1 })],
    ["wrong type", createRefreshToken({ userId: new mongoose.Types.ObjectId(), sessionId: "brand-session", familyId: "brand-family" })],
  ])("returns invalid-token 401 for %s token", async (_label, token) => {
    const response = await authorized("post", "/api/v1/brands", token, { name: "Denied" });
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid or expired access token");
  });

  it.each([
    ["customer", { role: "customer", adminLevel: null }],
    ["sales staff", { role: "sales_staff", adminLevel: null }],
    ["prescription staff", { role: "prescription_staff", adminLevel: null }],
    ["branch manager", { role: "administrator", adminLevel: "branch_manager" }],
    ["regular administrator", { role: "administrator", adminLevel: null }],
    ["inactive super administrator", { status: "inactive" }],
    ["locked super administrator", { status: "locked" }],
  ])("returns generic 403 for %s before validation or Brand lookup", async (_label, overrides) => {
    const user = await User.create(userInput(overrides));
    const lookup = vi.spyOn(Brand, "findById");
    const response = await authorized("patch", "/api/v1/brands/invalid-id", tokenFor(user), {});
    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Insufficient permission");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("uses current database authority and returns 401 for a deleted current User", async () => {
    const { user, token } = await superAdmin();
    await User.findByIdAndDelete(user._id);
    const response = await authorized("post", "/api/v1/brands", token, { name: "Denied" });
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid or expired access token");
  });
});

describe("Brand mutation database failures", () => {
  it("returns a controlled 500 for unexpected create failure", async () => {
    const { token } = await superAdmin();
    vi.spyOn(Brand, "create").mockRejectedValueOnce(new Error("create database secret"));
    const response = await authorized("post", "/api/v1/brands", token, { name: "Failure" });
    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ message: "Internal server error", details: null });
  });

  it("returns a controlled 500 for unexpected update lookup failure", async () => {
    const { token } = await superAdmin();
    vi.spyOn(Brand, "findById").mockRejectedValueOnce(new Error("update database secret"));
    const response = await authorized("patch", `/api/v1/brands/${new mongoose.Types.ObjectId()}`, token, { name: "Failure" });
    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ message: "Internal server error", details: null });
  });

  it("returns a controlled 500 for unexpected status write failure", async () => {
    const brand = await Brand.create({ name: "Status Failure" });
    const { token } = await superAdmin();
    vi.spyOn(Brand.prototype, "save").mockRejectedValueOnce(new Error("status database secret"));
    const response = await authorized("patch", `/api/v1/brands/${brand._id}/status`, token, { status: "inactive" });
    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ message: "Internal server error", details: null });
    expect((await Brand.findById(brand._id)).status).toBe("active");
  });
});
