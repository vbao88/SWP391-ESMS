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
    fullName: "Status Authorization User",
    email: `branch-status-${fixtureNumber}@example.com`,
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

function statusRequest(branchId, token, body) {
  const pending = request(app).patch(`/api/v1/branches/${branchId}/status`);
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
  expect(new Date(data.createdAt).toISOString()).toBe(data.createdAt);
  expect(new Date(data.updatedAt).toISOString()).toBe(data.updatedAt);
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

describe("PATCH /api/v1/branches/:branchId/status transitions", () => {
  it.each([
    ["active to inactive", "active", "inactive"],
    ["inactive to active", "inactive", "active"],
  ])("supports %s and changes only status", async (_label, currentStatus, requestedStatus) => {
    const branch = await Branch.create(branchFixture({ status: currentStatus }));
    const before = branch.toObject();
    const { token } = await createSuperAdmin();
    const response = await statusRequest(branch._id, token, { status: requestedStatus });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Branch status updated successfully.");
    expect(response.body.data.status).toBe(requestedStatus);
    expectAdminDto(response.body.data);
    expect(response.headers.ratelimit).toBeDefined();

    const stored = await Branch.findById(branch._id).lean();
    expect(stored.status).toBe(requestedStatus);
    for (const field of [
      "code", "name", "district", "city", "address", "phone", "eyeExamEnabled",
    ]) {
      expect(stored[field]).toEqual(before[field]);
    }
    expect(stored.operatingHours).toEqual(before.operatingHours);
    expect(stored.createdAt).toEqual(before.createdAt);
  });

  it.each(["active", "inactive"])(
    "returns idempotent 200 for %s to the same status without prescribing updatedAt behavior",
    async (status) => {
      const branch = await Branch.create(branchFixture({ status }));
      const { token } = await createSuperAdmin();
      const response = await statusRequest(branch._id, token, { status });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Branch status updated successfully.");
      expect(response.body.data.status).toBe(status);
      expect(new Date(response.body.data.updatedAt).toString()).not.toBe("Invalid Date");
      expect((await Branch.findById(branch._id)).status).toBe(status);
    },
  );

  it("hides a deactivated Branch publicly and restores it after reactivation", async () => {
    const branch = await Branch.create(branchFixture());
    const { token } = await createSuperAdmin();

    expect((await statusRequest(branch._id, token, { status: "inactive" })).status).toBe(200);
    const hiddenList = await request(app).get("/api/v1/branches");
    const hiddenDetail = await request(app).get(`/api/v1/branches/${branch._id}`);
    expect(hiddenList.body.data).toEqual([]);
    expect(hiddenDetail.status).toBe(404);
    expect(hiddenDetail.body.message).toBe("Branch not found");

    expect((await statusRequest(branch._id, token, { status: "active" })).status).toBe(200);
    const visibleList = await request(app).get("/api/v1/branches");
    const visibleDetail = await request(app).get(`/api/v1/branches/${branch._id}`);
    expect(visibleList.body.data).toHaveLength(1);
    expect(visibleDetail.status).toBe(200);
    for (const dto of [visibleList.body.data[0], visibleDetail.body.data]) {
      expect(dto).not.toHaveProperty("status");
      expect(dto).not.toHaveProperty("createdAt");
      expect(dto).not.toHaveProperty("updatedAt");
      expect(dto).not.toHaveProperty("_id");
    }
  });
});

describe("PATCH /api/v1/branches/:branchId/status validation and lookup", () => {
  it.each([
    ["missing status", {}],
    ["invalid status", { status: "archived" }],
    ["null status", { status: null }],
    ["numeric status", { status: 1 }],
    ["object status", { status: { value: "active" } }],
    ["unknown-only body", { unknown: "value" }],
  ])("returns 400 for %s without mutation", async (_label, body) => {
    const branch = await Branch.create(branchFixture());
    const { token } = await createSuperAdmin();
    const response = await statusRequest(branch._id, token, body);

    expectValidationFailure(response);
    expect((await Branch.findById(branch._id)).status).toBe("active");
  });

  it("returns 400 for invalid branchId before Branch lookup", async () => {
    const { token } = await createSuperAdmin();
    const lookupSpy = vi.spyOn(Branch, "findById");
    const response = await statusRequest("invalid-id", token, { status: "inactive" });

    expectValidationFailure(response);
    expect(lookupSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(response.body)).not.toContain("CastError");
  });

  it("returns 404 for an unknown valid branchId", async () => {
    const { token } = await createSuperAdmin();
    const response = await statusRequest(
      new mongoose.Types.ObjectId(), token, { status: "inactive" },
    );
    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Branch not found");
    expect(response.body.details).toBeNull();
  });
});

describe("PATCH /api/v1/branches/:branchId/status authorization", () => {
  it.each([
    ["missing header", undefined],
    ["malformed header", "Basic credentials"],
  ])("returns 401 for %s before validation and Branch lookup", async (_label, authorization) => {
    const branch = await Branch.create(branchFixture());
    const lookupSpy = vi.spyOn(Branch, "findById");
    const pending = request(app).patch(`/api/v1/branches/invalid-id/status`);
    if (authorization) pending.set("Authorization", authorization);
    const response = await pending.send({});

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Authentication required");
    expect(lookupSpy).not.toHaveBeenCalled();
    expect((await Branch.findOne({ _id: branch._id })).status).toBe("active");
  });

  it.each([
    ["invalid", () => "not-a-token"],
    ["expired", () => jwt.sign({
      userId: new mongoose.Types.ObjectId().toString(), role: "administrator",
      adminLevel: "super_admin", branchId: null, type: "access",
    }, env.jwtAccessSecret, { algorithm: "HS256", expiresIn: -1 })],
    ["wrong-type", () => createRefreshToken({
      userId: new mongoose.Types.ObjectId(), sessionId: "status-session", familyId: "status-family",
    })],
  ])("returns 401 for %s token", async (_label, makeToken) => {
    const branch = await Branch.create(branchFixture());
    const response = await statusRequest(branch._id, makeToken(), { status: "inactive" });
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid or expired access token");
    expect((await Branch.findById(branch._id)).status).toBe("active");
  });

  it.each([
    ["customer", { role: "customer", adminLevel: null }],
    ["sales staff", { role: "sales_staff", adminLevel: null }],
    ["prescription staff", { role: "prescription_staff", adminLevel: null }],
    ["branch manager", { role: "administrator", adminLevel: "branch_manager" }],
    ["locked super administrator", { status: "locked" }],
    ["inactive super administrator", { status: "inactive" }],
  ])("returns generic 403 for %s", async (_label, overrides) => {
    const branch = await Branch.create(branchFixture());
    const user = await User.create(userFixture(overrides));
    const response = await statusRequest(branch._id, tokenFor(user), { status: "inactive" });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Insufficient permission");
    expect((await Branch.findById(branch._id)).status).toBe("active");
  });

  it("uses current database state over stale super_admin JWT claims", async () => {
    const branch = await Branch.create(branchFixture());
    const { user, token } = await createSuperAdmin();
    await User.findByIdAndUpdate(user._id, { adminLevel: "branch_manager" });

    expect((await statusRequest(branch._id, token, { status: "inactive" })).status).toBe(403);
    expect((await Branch.findById(branch._id)).status).toBe("active");
  });

  it("returns 401 when the current User was deleted", async () => {
    const branch = await Branch.create(branchFixture());
    const { user, token } = await createSuperAdmin();
    await User.findByIdAndDelete(user._id);

    const response = await statusRequest(branch._id, token, { status: "inactive" });
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid or expired access token");
  });

  it("forwards authorization database failure to controlled global 500", async () => {
    const branch = await Branch.create(branchFixture());
    const { token } = await createSuperAdmin();
    vi.spyOn(User, "findById").mockReturnValue({
      lean: vi.fn().mockRejectedValue(new Error("authorization database details")),
    });

    const response = await statusRequest(branch._id, token, { status: "inactive" });
    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Internal server error");
    expect((await Branch.findOne({ _id: branch._id })).status).toBe("active");
  });
});

describe("PATCH /api/v1/branches/:branchId/status containment and errors", () => {
  it("strips unknown, internal, and information fields and changes only status", async () => {
    const branch = await Branch.create(branchFixture());
    const before = branch.toObject();
    const { token } = await createSuperAdmin();
    const response = await statusRequest(branch._id, token, {
      status: "inactive", unknown: "hidden", _id: new mongoose.Types.ObjectId(), __v: 99,
      createdAt: "2000-01-01T00:00:00.000Z", updatedAt: "2000-01-01T00:00:00.000Z",
      code: "NEW", name: "Changed", address: "Changed",
      operatingHours: { open: "00:00", close: "01:00" },
    });

    expect(response.status).toBe(200);
    expectAdminDto(response.body.data);
    expect(JSON.stringify(response.body)).not.toContain("hidden");
    expect(JSON.stringify(response.body)).not.toContain("authorization");
    const stored = await Branch.findById(branch._id).lean();
    expect(stored.status).toBe("inactive");
    for (const field of ["code", "name", "address", "operatingHours", "createdAt"]) {
      expect(stored[field]).toEqual(before[field]);
    }
    expect(stored.__v).toBe(0);
  });

  it("returns controlled 500 when Branch lookup fails", async () => {
    const { token } = await createSuperAdmin();
    vi.spyOn(Branch, "findById").mockRejectedValue(new Error("lookup query details"));

    const response = await statusRequest(
      new mongoose.Types.ObjectId(), token, { status: "inactive" },
    );
    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Internal server error");
    expect(response.body.details).toBeNull();
    expect(response.body).not.toHaveProperty("query");
  });

  it("returns controlled 500 when the atomic status update fails without mapping to 409", async () => {
    const branch = await Branch.create(branchFixture());
    const { token } = await createSuperAdmin();
    vi.spyOn(Branch, "findByIdAndUpdate").mockRejectedValue(new Error("update document details"));

    const response = await statusRequest(branch._id, token, { status: "inactive" });
    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Internal server error");
    expect(response.status).not.toBe(409);
    expect((await Branch.findById(branch._id)).status).toBe("active");
  });

  it("keeps Public Read public when an invalid Bearer token is supplied", async () => {
    await Branch.create(branchFixture());
    const response = await request(app).get("/api/v1/branches")
      .set("Authorization", "Bearer invalid-token");
    expect(response.status).toBe(200);
    expect(response.body.data[0]).not.toHaveProperty("status");
    expect(response.body.data[0]).not.toHaveProperty("createdAt");
    expect(response.body.data[0]).not.toHaveProperty("updatedAt");
  });
});

describe("Branch status regression boundaries", () => {
  it("keeps Create and duplicate-code behavior intact", async () => {
    const { token } = await createSuperAdmin();
    const body = { code: "DD", name: "Dong Da", district: "Dong Da", address: "1 Dong Da" };
    const created = await request(app).post("/api/v1/branches")
      .set("Authorization", `Bearer ${token}`).send(body);
    const duplicate = await request(app).post("/api/v1/branches")
      .set("Authorization", `Bearer ${token}`).send(body);
    expect(created.status).toBe(201);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.message).toBe("Branch code already exists");
  });

  it("keeps information update working while status is stripped and code remains forbidden", async () => {
    const branch = await Branch.create(branchFixture());
    const { token } = await createSuperAdmin();
    const updated = await request(app).patch(`/api/v1/branches/${branch._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Updated", status: "inactive" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe("Updated");
    expect(updated.body.data.status).toBe("active");

    const rejected = await request(app).patch(`/api/v1/branches/${branch._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Must Not Change", code: "CG" });
    expect(rejected.status).toBe(400);
    expect((await Branch.findById(branch._id)).name).toBe("Updated");
  });
});
