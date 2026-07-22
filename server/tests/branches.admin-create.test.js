import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { Branch } from "../src/models/Branch.js";
import { User } from "../src/models/User.js";
import { signAccessToken } from "../src/utils/token.js";
import {
  clearTestCollections,
  connectTestDatabase,
  disconnectTestDatabase,
} from "./helpers/database.js";

const ADMIN_DTO_FIELDS = [
  "address",
  "city",
  "code",
  "createdAt",
  "district",
  "eyeExamEnabled",
  "id",
  "name",
  "operatingHours",
  "phone",
  "status",
  "updatedAt",
];

let fixtureNumber = 0;

function userFixture(overrides = {}) {
  fixtureNumber += 1;
  return {
    fullName: "Branch Admin Test User",
    email: `branch-admin-${fixtureNumber}@example.com`,
    passwordHash: "test-password-hash",
    role: "administrator",
    adminLevel: "super_admin",
    status: "active",
    ...overrides,
  };
}

function validBody(overrides = {}) {
  return {
    code: "HK",
    name: "Lensora Optical - Hoan Kiem",
    district: "Hoan Kiem",
    address: "Hoan Kiem, Ha Noi",
    ...overrides,
  };
}

function accessToken(user, overrides = {}) {
  return signAccessToken({
    _id: user._id,
    role: user.role,
    adminLevel: user.adminLevel,
    branchId: user.branchId,
    ...overrides,
  });
}

function createRequest(token, body = validBody()) {
  const pendingRequest = request(app).post("/api/v1/branches");
  if (token) pendingRequest.set("Authorization", `Bearer ${token}`);
  return pendingRequest.send(body);
}

async function createSuperAdmin() {
  const user = await User.create(userFixture());
  return { user, token: accessToken(user) };
}

function expectValidationFailure(response) {
  expect(response.status).toBe(400);
  expect(response.body.success).toBe(false);
  expect(response.body.message).toBe("Validation failed");
  expect(Array.isArray(response.body.details)).toBe(true);
}

function expectAdminDto(data) {
  expect(Object.keys(data).sort()).toEqual(ADMIN_DTO_FIELDS);
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

describe("POST /api/v1/branches authorization", () => {
  it("returns 401 without a token and does not create a Branch", async () => {
    const createSpy = vi.spyOn(Branch, "create");
    const response = await createRequest(undefined, {});

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Authentication required");
    expect(createSpy).not.toHaveBeenCalled();
    expect(await Branch.countDocuments()).toBe(0);
  });

  it.each([
    ["customer", { role: "customer", adminLevel: null }],
    ["sales staff", { role: "sales_staff", adminLevel: null }],
    ["branch manager", { role: "administrator", adminLevel: "branch_manager" }],
  ])("returns 403 for an active %s before validation or create", async (_label, overrides) => {
    const user = await User.create(userFixture(overrides));
    const createSpy = vi.spyOn(Branch, "create");
    const response = await createRequest(accessToken(user), {});

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Insufficient permission");
    expect(createSpy).not.toHaveBeenCalled();
    expect(await Branch.countDocuments()).toBe(0);
  });

  it("denies stale super_admin JWT claims after a database downgrade", async () => {
    const { user, token } = await createSuperAdmin();
    await User.findByIdAndUpdate(user._id, { adminLevel: "branch_manager" });

    const response = await createRequest(token);
    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Insufficient permission");
    expect(await Branch.countDocuments()).toBe(0);
  });
});

describe("POST /api/v1/branches success and containment", () => {
  it("creates from required fields, applies defaults, and returns the Admin DTO", async () => {
    const { token } = await createSuperAdmin();
    const response = await createRequest(token);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe("Branch created successfully.");
    expectAdminDto(response.body.data);
    expect(response.body.data).toMatchObject({
      code: "HK",
      phone: "",
      eyeExamEnabled: true,
      operatingHours: { open: "09:00", close: "21:00" },
      status: "active",
    });

    const stored = await Branch.findById(response.body.data.id);
    expect(stored).not.toBeNull();
    expect(stored.code).toBe("HK");
    expect(stored.city).toBe(Branch.schema.path("city").defaultValue);
    expect(stored.status).toBe("active");
  });

  it("normalizes strings and persists all optional fields", async () => {
    const { token } = await createSuperAdmin();
    const response = await createRequest(
      token,
      validBody({
        code: "  hn  ",
        name: "  Lensora Hoan Kiem  ",
        district: "  Hoan Kiem  ",
        city: "  Ha Noi  ",
        address: "  1 Trang Tien  ",
        phone: "  024 000 0000  ",
        eyeExamEnabled: false,
        operatingHours: { open: "08:30", close: "20:15" },
      }),
    );

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      code: "HN",
      name: "Lensora Hoan Kiem",
      district: "Hoan Kiem",
      city: "Ha Noi",
      address: "1 Trang Tien",
      phone: "024 000 0000",
      eyeExamEnabled: false,
      operatingHours: { open: "08:30", close: "20:15" },
    });
    const stored = await Branch.findById(response.body.data.id).lean();
    expect(stored).toMatchObject({
      code: "HN",
      phone: "024 000 0000",
      eyeExamEnabled: false,
      operatingHours: { open: "08:30", close: "20:15" },
    });
  });

  it("accepts and persists an empty phone string", async () => {
    const { token } = await createSuperAdmin();
    const response = await createRequest(token, validBody({ phone: "   " }));

    expect(response.status).toBe(201);
    expect(response.body.data.phone).toBe("");
    expect((await Branch.findOne()).phone).toBe("");
  });

  it("strips unknown fields without persisting or returning them", async () => {
    const { token } = await createSuperAdmin();
    const response = await createRequest(token, validBody({ unsupportedField: "secret" }));

    expect(response.status).toBe(201);
    expect(response.body.data).not.toHaveProperty("unsupportedField");
    expect((await Branch.findOne().lean())).not.toHaveProperty("unsupportedField");
  });

  it("strips client status so the model default wins", async () => {
    const { token } = await createSuperAdmin();
    const response = await createRequest(token, validBody({ status: "inactive" }));

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe("active");
    expect((await Branch.findOne()).status).toBe("active");
  });

  it("strips client-controlled identifiers, version, and timestamps", async () => {
    const { token } = await createSuperAdmin();
    const suppliedId = new mongoose.Types.ObjectId();
    const suppliedDate = "2000-01-01T00:00:00.000Z";
    const response = await createRequest(
      token,
      validBody({
        _id: suppliedId.toString(),
        __v: 99,
        createdAt: suppliedDate,
        updatedAt: suppliedDate,
      }),
    );

    expect(response.status).toBe(201);
    expect(response.body.data.id).not.toBe(suppliedId.toString());
    expect(response.body.data.createdAt).not.toBe(suppliedDate);
    expect(response.body.data.updatedAt).not.toBe(suppliedDate);
    expectAdminDto(response.body.data);
    const stored = await Branch.findById(response.body.data.id).lean();
    expect(stored.__v).toBe(0);
    expect(stored.createdAt.toISOString()).not.toBe(suppliedDate);
  });
});

describe("POST /api/v1/branches validation", () => {
  it.each(["code", "name", "district", "address"])(
    "returns 400 when required field %s is missing",
    async (field) => {
      const { token } = await createSuperAdmin();
      const body = validBody();
      delete body[field];
      const response = await createRequest(token, body);

      expectValidationFailure(response);
      expect(await Branch.countDocuments()).toBe(0);
    },
  );

  it("returns 400 for an empty body", async () => {
    const { token } = await createSuperAdmin();
    const response = await createRequest(token, {});
    expectValidationFailure(response);
    expect(await Branch.countDocuments()).toBe(0);
  });

  it.each([
    ["blank required string", validBody({ name: "   " })],
    ["non-boolean eyeExamEnabled", validBody({ eyeExamEnabled: "true" })],
    ["object phone", validBody({ phone: { number: "024" } })],
    ["array phone", validBody({ phone: ["024"] })],
  ])("returns 400 for %s", async (_label, body) => {
    const { token } = await createSuperAdmin();
    const response = await createRequest(token, body);
    expectValidationFailure(response);
    expect(await Branch.countDocuments()).toBe(0);
  });

  it.each([
    ["invalid open format", { open: "9:00", close: "21:00" }],
    ["invalid close time", { open: "09:00", close: "24:00" }],
    ["equal range", { open: "09:00", close: "09:00" }],
    ["reversed range", { open: "21:00", close: "09:00" }],
    ["partial open invalid against default close", { open: "22:00" }],
    ["partial close invalid against default open", { close: "08:00" }],
  ])("returns 400 for %s operating hours", async (_label, operatingHours) => {
    const { token } = await createSuperAdmin();
    const response = await createRequest(token, validBody({ operatingHours }));
    expectValidationFailure(response);
    expect(await Branch.countDocuments()).toBe(0);
  });

  it.each([
    ["both boundary values", { open: "00:00", close: "23:59" }, { open: "00:00", close: "23:59" }],
    ["partial open", { open: "08:00" }, { open: "08:00", close: "21:00" }],
    ["partial close", { close: "22:00" }, { open: "09:00", close: "22:00" }],
  ])("accepts %s and persists the final valid interval", async (_label, operatingHours, expected) => {
    const { token } = await createSuperAdmin();
    const response = await createRequest(token, validBody({ operatingHours }));
    expect(response.status).toBe(201);
    expect(response.body.data.operatingHours).toEqual(expected);
    expect((await Branch.findOne()).operatingHours.toObject()).toEqual(expected);
  });
});

describe("POST /api/v1/branches duplicate and database errors", () => {
  it("maps a sequential duplicate normalized code to controlled 409", async () => {
    const { token } = await createSuperAdmin();
    expect((await createRequest(token, validBody({ code: "HN" }))).status).toBe(201);
    const response = await createRequest(token, validBody({ code: "  hn  " }));

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      message: "Branch code already exists",
      details: null,
    });
    expect(JSON.stringify(response.body)).not.toContain("E11000");
    expect(await Branch.countDocuments()).toBe(1);
  });

  it("allows exactly one of two concurrent same-code creates", async () => {
    const { token } = await createSuperAdmin();
    const responses = await Promise.all([
      createRequest(token, validBody({ code: "RACE" })),
      createRequest(token, validBody({ code: " race " })),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(responses.find(({ status }) => status === 409).body.message).toBe(
      "Branch code already exists",
    );
    expect(await Branch.countDocuments({ code: "RACE" })).toBe(1);
  });

  it("maps a Branch code duplicate-key error from persistence to 409", async () => {
    const { token } = await createSuperAdmin();
    vi.spyOn(Branch, "create").mockRejectedValue({
      code: 11000,
      keyPattern: { code: 1 },
      keyValue: { code: "HK" },
    });

    const response = await createRequest(token);
    expect(response.status).toBe(409);
    expect(response.body.message).toBe("Branch code already exists");
  });

  it("forwards unrelated database errors to the global 500 handler without leaking details", async () => {
    const { token } = await createSuperAdmin();
    vi.spyOn(Branch, "create").mockRejectedValue(new Error("sensitive database failure"));

    const response = await createRequest(token);
    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Internal server error");
    expect(response.body.details).toBeNull();
    expect(response.body).not.toHaveProperty("code");
    expect(response.body).not.toHaveProperty("keyPattern");
    expect(response.body).not.toHaveProperty("keyValue");
  });
});

describe("Protected create Public Read regression", () => {
  it("makes a newly created active Branch publicly readable without expanding the Public DTO", async () => {
    const { token } = await createSuperAdmin();
    const created = await createRequest(token);

    for (const authorization of [undefined, "Bearer invalid-access-token"]) {
      const listRequest = request(app).get("/api/v1/branches");
      if (authorization) listRequest.set("Authorization", authorization);
      const list = await listRequest;
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).not.toHaveProperty("status");
      expect(list.body.data[0]).not.toHaveProperty("createdAt");
      expect(list.body.data[0]).not.toHaveProperty("updatedAt");
    }

    const detail = await request(app).get(`/api/v1/branches/${created.body.data.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).not.toHaveProperty("status");
    expect(detail.body.data).not.toHaveProperty("createdAt");
    expect(detail.body.data).not.toHaveProperty("updatedAt");
  });
});
