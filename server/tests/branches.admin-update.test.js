import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { env } from "../src/config/env.js";
import { Branch } from "../src/models/Branch.js";
import { User } from "../src/models/User.js";
import { createRefreshToken, signAccessToken } from "../src/utils/token.js";
import {
  clearTestCollections,
  connectTestDatabase,
  disconnectTestDatabase,
} from "./helpers/database.js";

const ADMIN_FIELDS = [
  "address", "city", "code", "createdAt", "district", "eyeExamEnabled", "id",
  "name", "operatingHours", "phone", "status", "updatedAt",
];

let fixtureNumber = 0;

function userFixture(overrides = {}) {
  fixtureNumber += 1;
  return {
    fullName: "Update Authorization User",
    email: `branch-update-${fixtureNumber}@example.com`,
    passwordHash: "test-password-hash",
    role: "administrator",
    adminLevel: "super_admin",
    status: "active",
    ...overrides,
  };
}

function branchFixture(overrides = {}) {
  return {
    code: "CG",
    name: "Lensora Cau Giay",
    district: "Cau Giay",
    city: "Ha Noi",
    address: "1 Cau Giay",
    phone: "0240000000",
    eyeExamEnabled: true,
    operatingHours: { open: "09:00", close: "21:00" },
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

async function createSuperAdmin() {
  const user = await User.create(userFixture());
  return { user, token: tokenFor(user) };
}

function updateRequest(branchId, token, body) {
  const pending = request(app).patch(`/api/v1/branches/${branchId}`);
  if (token) pending.set("Authorization", `Bearer ${token}`);
  return pending.send(body);
}

function expectValidationFailure(response) {
  expect(response.status).toBe(400);
  expect(response.body.message).toBe("Validation failed");
  expect(Array.isArray(response.body.details)).toBe(true);
}

function expectAdminDto(data) {
  expect(Object.keys(data).sort()).toEqual(ADMIN_FIELDS);
  expect(Object.keys(data.operatingHours).sort()).toEqual(["close", "open"]);
  expect(data).not.toHaveProperty("_id");
  expect(data).not.toHaveProperty("__v");
}

beforeAll(async () => {
  await connectTestDatabase();
  await Promise.all([Branch.init(), User.init()]);
});

beforeEach(async () => {
  vi.restoreAllMocks();
  await clearTestCollections([Branch, User]);
});

afterAll(async () => {
  vi.restoreAllMocks();
  await clearTestCollections([Branch, User]);
  await disconnectTestDatabase();
});

describe("PATCH /api/v1/branches/:branchId authorization and lookup", () => {
  it("runs authorization before validation and Branch lookup", async () => {
    const branch = await Branch.create(branchFixture());
    const lookupSpy = vi.spyOn(Branch, "findById");
    const response = await updateRequest("invalid-id", undefined, {});

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Authentication required");
    expect(lookupSpy).not.toHaveBeenCalled();
    expect((await Branch.findOne({ _id: branch._id })).name).toBe(branch.name);
  });

  it.each([
    ["invalid", () => "not-a-token"],
    ["expired", () => jwt.sign({
      userId: new mongoose.Types.ObjectId().toString(), role: "administrator",
      adminLevel: "super_admin", branchId: null, type: "access",
    }, env.jwtAccessSecret, { algorithm: "HS256", expiresIn: -1 })],
    ["refresh", () => createRefreshToken({
      userId: new mongoose.Types.ObjectId(), sessionId: "update-session", familyId: "update-family",
    })],
  ])("returns 401 for a %s token without changing the Branch", async (_label, makeToken) => {
    const branch = await Branch.create(branchFixture());
    const response = await updateRequest(branch._id, makeToken(), { name: "Changed" });

    expect(response.status).toBe(401);
    expect((await Branch.findById(branch._id)).name).toBe(branch.name);
  });

  it.each([
    ["customer", { role: "customer", adminLevel: null }],
    ["sales staff", { role: "sales_staff", adminLevel: null }],
    ["branch manager", { role: "administrator", adminLevel: "branch_manager" }],
  ])("returns 403 for an active %s without changing the Branch", async (_label, overrides) => {
    const branch = await Branch.create(branchFixture());
    const user = await User.create(userFixture(overrides));
    const response = await updateRequest(branch._id, tokenFor(user), { name: "Changed" });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Insufficient permission");
    expect((await Branch.findById(branch._id)).name).toBe(branch.name);
  });

  it("denies stale super_admin claims after downgrade", async () => {
    const branch = await Branch.create(branchFixture());
    const { user, token } = await createSuperAdmin();
    await User.findByIdAndUpdate(user._id, { role: "customer", adminLevel: null });

    expect((await updateRequest(branch._id, token, { name: "Changed" })).status).toBe(403);
    expect((await Branch.findById(branch._id)).name).toBe(branch.name);
  });

  it("returns 401 when the current User was deleted", async () => {
    const branch = await Branch.create(branchFixture());
    const { user, token } = await createSuperAdmin();
    await User.findByIdAndDelete(user._id);

    const response = await updateRequest(branch._id, token, { name: "Changed" });
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid or expired access token");
  });

  it("returns 400 for an invalid branchId after authorization", async () => {
    const { token } = await createSuperAdmin();
    const response = await updateRequest("invalid-id", token, { name: "Changed" });
    expectValidationFailure(response);
  });

  it("returns 404 for an unknown valid branchId", async () => {
    const { token } = await createSuperAdmin();
    const response = await updateRequest(new mongoose.Types.ObjectId(), token, { name: "Changed" });
    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Branch not found");
  });

  it("forwards an unexpected Branch lookup error as controlled public 500", async () => {
    const { token } = await createSuperAdmin();
    vi.spyOn(Branch, "findById").mockRejectedValue(new Error("database query details"));

    const response = await updateRequest(new mongoose.Types.ObjectId(), token, { name: "Changed" });
    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Internal server error");
    expect(response.body.details).toBeNull();
    expect(response.body).not.toHaveProperty("query");
  });
});

describe("PATCH /api/v1/branches/:branchId successful updates", () => {
  it("updates one trimmed string and preserves omitted fields", async () => {
    const branch = await Branch.create(branchFixture());
    const { token } = await createSuperAdmin();
    const response = await updateRequest(branch._id, token, { name: "  Updated Name  " });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Branch updated successfully.");
    expectAdminDto(response.body.data);
    expect(response.body.data.name).toBe("Updated Name");
    expect(response.body.data.address).toBe(branch.address);
    const stored = await Branch.findById(branch._id);
    expect(stored.name).toBe("Updated Name");
    expect(stored.code).toBe(branch.code);
    expect(stored.status).toBe("active");
  });

  it("updates multiple allowlisted fields and persists normalized values", async () => {
    const branch = await Branch.create(branchFixture());
    const { token } = await createSuperAdmin();
    const response = await updateRequest(branch._id, token, {
      district: "  Dong Da  ", city: "  Ha Noi  ", address: "  2 Tay Son  ",
      phone: "  024 111 222  ", eyeExamEnabled: false,
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      district: "Dong Da", city: "Ha Noi", address: "2 Tay Son",
      phone: "024 111 222", eyeExamEnabled: false,
    });
    expect(await Branch.findById(branch._id).lean()).toMatchObject({
      district: "Dong Da", city: "Ha Noi", address: "2 Tay Son",
      phone: "024 111 222", eyeExamEnabled: false,
    });
  });

  it("accepts an empty phone string", async () => {
    const branch = await Branch.create(branchFixture());
    const { token } = await createSuperAdmin();
    const response = await updateRequest(branch._id, token, { phone: "   " });
    expect(response.status).toBe(200);
    expect(response.body.data.phone).toBe("");
    expect((await Branch.findById(branch._id)).phone).toBe("");
  });

  it("preserves createdAt and advances updatedAt using model timestamps", async () => {
    const branch = await Branch.create(branchFixture());
    const oldDate = new Date("2020-01-01T00:00:00.000Z");
    await Branch.collection.updateOne(
      { _id: branch._id }, { $set: { createdAt: oldDate, updatedAt: oldDate } },
    );
    const { token } = await createSuperAdmin();
    const response = await updateRequest(branch._id, token, { name: "Updated" });

    expect(response.body.data.createdAt).toBe(oldDate.toISOString());
    expect(new Date(response.body.data.updatedAt).getTime()).toBeGreaterThan(oldDate.getTime());
  });

  it("updates an inactive Branch without changing its status", async () => {
    const branch = await Branch.create(branchFixture({ status: "inactive" }));
    const { token } = await createSuperAdmin();
    const response = await updateRequest(branch._id, token, { address: "New inactive address" });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("inactive");
    expect((await Branch.findById(branch._id)).status).toBe("inactive");
  });
});

describe("PATCH /api/v1/branches/:branchId validation and containment", () => {
  it.each([
    ["same code", "CG"], ["new code", "NEW"], ["empty code", ""],
    ["null code", null], ["object code", { value: "CG" }],
  ])("rejects %s whenever code is present", async (_label, code) => {
    const branch = await Branch.create(branchFixture());
    const before = branch.toObject();
    const { token } = await createSuperAdmin();
    const response = await updateRequest(branch._id, token, { code, name: "Must Not Change" });

    expectValidationFailure(response);
    const after = await Branch.findById(branch._id).lean();
    expect(after.code).toBe(before.code);
    expect(after.name).toBe(before.name);
  });

  it("strips status and internal fields while applying a valid mutable field", async () => {
    const branch = await Branch.create(branchFixture());
    const originalCreatedAt = branch.createdAt.toISOString();
    const { token } = await createSuperAdmin();
    const response = await updateRequest(branch._id, token, {
      name: "Allowed Change", status: "inactive", _id: new mongoose.Types.ObjectId(),
      __v: 99, createdAt: "2000-01-01T00:00:00.000Z",
      updatedAt: "2000-01-01T00:00:00.000Z", unknownField: "hidden",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe("Allowed Change");
    expect(response.body.data.status).toBe("active");
    expect(response.body.data.createdAt).toBe(originalCreatedAt);
    expectAdminDto(response.body.data);
    const stored = await Branch.findById(branch._id).lean();
    expect(stored.__v).toBe(0);
    expect(stored).not.toHaveProperty("unknownField");
  });

  it.each([
    ["empty body", {}],
    ["unknown-only body", { unknown: "value", status: "inactive", __v: 4 }],
  ])("returns 400 for %s after stripping", async (_label, body) => {
    const branch = await Branch.create(branchFixture());
    const { token } = await createSuperAdmin();
    const response = await updateRequest(branch._id, token, body);
    expectValidationFailure(response);
    expect((await Branch.findById(branch._id)).name).toBe(branch.name);
  });

  it.each([
    ["empty required name", { name: "   " }],
    ["object name", { name: { value: "Name" } }],
    ["string boolean", { eyeExamEnabled: "true" }],
    ["numeric boolean", { eyeExamEnabled: 1 }],
    ["object phone", { phone: { number: "024" } }],
    ["array phone", { phone: ["024"] }],
  ])("returns 400 for %s without modifying the document", async (_label, body) => {
    const branch = await Branch.create(branchFixture());
    const { token } = await createSuperAdmin();
    const response = await updateRequest(branch._id, token, body);
    expectValidationFailure(response);
    expect((await Branch.findById(branch._id)).toObject()).toMatchObject(branch.toObject());
  });
});

describe("PATCH /api/v1/branches/:branchId operating-hours merge", () => {
  it.each([
    ["both sides", { open: "08:00", close: "20:00" }, { open: "08:00", close: "20:00" }],
    ["partial open with stored close", { open: "07:00" }, { open: "07:00", close: "18:00" }],
    ["partial close with stored open", { close: "19:00" }, { open: "06:00", close: "19:00" }],
    ["boundary interval", { open: "00:00", close: "23:59" }, { open: "00:00", close: "23:59" }],
  ])("updates %s using final valid values", async (_label, operatingHours, expected) => {
    const branch = await Branch.create(branchFixture({
      operatingHours: { open: "06:00", close: "18:00" },
    }));
    const { token } = await createSuperAdmin();
    const response = await updateRequest(branch._id, token, { operatingHours });

    expect(response.status).toBe(200);
    expect(response.body.data.operatingHours).toEqual(expected);
    expect((await Branch.findById(branch._id)).operatingHours.toObject()).toEqual(expected);
  });

  it.each([
    ["invalid format", { open: "9:00" }],
    ["out-of-range time", { close: "24:00" }],
    ["equal final interval", { open: "18:00" }],
    ["reversed final interval", { open: "19:00" }],
    ["overnight interval", { open: "22:00", close: "06:00" }],
    ["partial close before stored open", { close: "05:00" }],
  ])("rejects %s atomically", async (_label, operatingHours) => {
    const branch = await Branch.create(branchFixture({
      operatingHours: { open: "06:00", close: "18:00" }, name: "Original",
    }));
    const { token } = await createSuperAdmin();
    const response = await updateRequest(branch._id, token, {
      name: "Must Not Persist", operatingHours,
    });

    expectValidationFailure(response);
    const stored = await Branch.findById(branch._id);
    expect(stored.name).toBe("Original");
    expect(stored.operatingHours.toObject()).toEqual({ open: "06:00", close: "18:00" });
  });
});

describe("Update Branch regression boundaries", () => {
  it("keeps Create, duplicate handling, and Public Read contracts intact", async () => {
    const { token } = await createSuperAdmin();
    const body = { code: "DD", name: "Dong Da", district: "Dong Da", address: "1 Dong Da" };
    const created = await request(app).post("/api/v1/branches")
      .set("Authorization", `Bearer ${token}`).send(body);
    expect(created.status).toBe(201);
    const duplicate = await request(app).post("/api/v1/branches")
      .set("Authorization", `Bearer ${token}`).send(body);
    expect(duplicate.status).toBe(409);

    for (const authorization of [undefined, "Bearer invalid-token"]) {
      const pending = request(app).get("/api/v1/branches");
      if (authorization) pending.set("Authorization", authorization);
      const response = await pending;
      expect(response.status).toBe(200);
      expect(response.body.data[0]).not.toHaveProperty("status");
      expect(response.body.data[0]).not.toHaveProperty("createdAt");
    }
  });

});
