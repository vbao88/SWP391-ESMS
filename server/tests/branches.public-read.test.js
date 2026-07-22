import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { Branch } from "../src/models/Branch.js";
import { signAccessToken } from "../src/utils/token.js";
import {
  clearTestCollections,
  connectTestDatabase,
  disconnectTestDatabase,
} from "./helpers/database.js";

const PUBLIC_FIELDS = [
  "address",
  "city",
  "code",
  "district",
  "eyeExamEnabled",
  "id",
  "name",
  "operatingHours",
  "phone",
];

function branchFixture(overrides = {}) {
  return {
    code: "CG",
    name: "Lensora Optical - Cau Giay",
    district: "Cau Giay",
    city: "Ha Noi",
    address: "Cau Giay, Ha Noi",
    phone: "0240000000",
    eyeExamEnabled: true,
    status: "active",
    ...overrides,
  };
}

function expectPublicBranch(dto, branch) {
  expect(Object.keys(dto).sort()).toEqual(PUBLIC_FIELDS);
  expect(dto).toEqual({
    id: branch._id.toString(),
    code: branch.code,
    name: branch.name,
    district: branch.district,
    city: branch.city,
    address: branch.address,
    phone: branch.phone,
    eyeExamEnabled: branch.eyeExamEnabled,
    operatingHours: {
      open: branch.operatingHours.open,
      close: branch.operatingHours.close,
    },
  });
  expect(typeof dto.id).toBe("string");
}

beforeAll(async () => {
  await connectTestDatabase();
  await Branch.init();
});

beforeEach(async () => {
  await clearTestCollections([Branch]);
  vi.restoreAllMocks();
});

afterAll(async () => {
  await clearTestCollections([Branch]);
  await disconnectTestDatabase();
});

describe("Branch public read API", () => {
  it("allows a Guest to list active branches", async () => {
    const branch = await Branch.create(branchFixture());
    const response = await request(app).get("/api/v1/branches");

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Branches retrieved successfully.");
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expectPublicBranch(response.body.data[0], branch);
  });

  it("remains public when a valid or invalid Bearer token is supplied", async () => {
    await Branch.create(branchFixture());
    const accessToken = signAccessToken({
      _id: new mongoose.Types.ObjectId(),
      role: "customer",
      adminLevel: null,
      branchId: null,
    });

    for (const token of [accessToken, "invalid-access-token"]) {
      const response = await request(app)
        .get("/api/v1/branches")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Branches retrieved successfully.");
    }
  });

  it("returns only active branches", async () => {
    await Branch.create([
      branchFixture({ code: "CG" }),
      branchFixture({ code: "DD", name: "Dong Da", district: "Dong Da", status: "inactive" }),
    ]);
    const response = await request(app).get("/api/v1/branches");

    expect(response.body.data.map(({ code }) => code)).toEqual(["CG"]);
  });

  it("returns an empty list when no active branch exists", async () => {
    await Branch.create(branchFixture({ status: "inactive" }));
    const response = await request(app).get("/api/v1/branches");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "Branches retrieved successfully.",
      data: [],
    });
  });

  it("sorts the list by ascending code regardless of insertion order", async () => {
    await Branch.create([
      branchFixture({ code: "HD", name: "Ha Dong", district: "Ha Dong" }),
      branchFixture({ code: "CG" }),
      branchFixture({ code: "DD", name: "Dong Da", district: "Dong Da" }),
    ]);
    const response = await request(app).get("/api/v1/branches");

    expect(response.body.data.map(({ code }) => code)).toEqual(["CG", "DD", "HD"]);
  });

  it("ignores unsupported query parameters", async () => {
    await Branch.create([
      branchFixture({ code: "CG" }),
      branchFixture({ code: "DD", name: "Dong Da", district: "Dong Da", status: "inactive" }),
    ]);
    const response = await request(app)
      .get("/api/v1/branches")
      .query({ status: "inactive", sort: "-code", page: 99 });

    expect(response.status).toBe(200);
    expect(response.body.data.map(({ code }) => code)).toEqual(["CG"]);
  });

  it("allows a Guest to view active branch detail", async () => {
    const branch = await Branch.create(branchFixture());
    const response = await request(app).get(`/api/v1/branches/${branch._id}`);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Branch retrieved successfully.");
    expect(response.body.success).toBe(true);
    expectPublicBranch(response.body.data, branch);
  });

  it("rejects a malformed branchId before a database lookup", async () => {
    const findOne = vi.spyOn(Branch, "findOne");
    const response = await request(app).get("/api/v1/branches/not-an-object-id");

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation failed");
    expect(response.body.details).toEqual(["branchId must be a valid MongoDB ObjectId"]);
    expect(findOne).not.toHaveBeenCalled();
  });

  it("returns Branch not found for an unknown valid ObjectId", async () => {
    const response = await request(app).get(
      `/api/v1/branches/${new mongoose.Types.ObjectId()}`,
    );

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      message: "Branch not found",
      details: null,
    });
  });

  it("conceals an inactive branch with the same public 404 response", async () => {
    const branch = await Branch.create(branchFixture({ status: "inactive" }));
    const inactiveResponse = await request(app).get(`/api/v1/branches/${branch._id}`);
    const unknownResponse = await request(app).get(
      `/api/v1/branches/${new mongoose.Types.ObjectId()}`,
    );

    expect(inactiveResponse.status).toBe(404);
    expect(unknownResponse.status).toBe(404);
    expect(inactiveResponse.body).toEqual(unknownResponse.body);
  });

  it("allowlists list and detail DTO fields even when storage has an extra field", async () => {
    const _id = new mongoose.Types.ObjectId();
    await Branch.collection.insertOne({
      _id,
      ...branchFixture(),
      operatingHours: { open: "09:00", close: "21:00" },
      internalSecret: "must-not-leak",
      __v: 7,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const listResponse = await request(app).get("/api/v1/branches");
    const detailResponse = await request(app).get(`/api/v1/branches/${_id}`);

    for (const dto of [listResponse.body.data[0], detailResponse.body.data]) {
      expect(Object.keys(dto).sort()).toEqual(PUBLIC_FIELDS);
      expect(JSON.stringify(dto)).not.toMatch(
        /_id|__v|status|createdAt|updatedAt|internalSecret|must-not-leak/,
      );
    }
  });

  it("serializes default and configured operating hours", async () => {
    const defaultHours = await Branch.create(branchFixture({ code: "CG" }));
    const configuredHours = await Branch.create(
      branchFixture({
        code: "DD",
        name: "Dong Da",
        district: "Dong Da",
        operatingHours: { open: "10:00", close: "20:00" },
      }),
    );
    const response = await request(app).get("/api/v1/branches");

    expect(response.body.data[0]).toMatchObject({
      id: defaultHours._id.toString(),
      operatingHours: { open: "09:00", close: "21:00" },
    });
    expect(response.body.data[1]).toMatchObject({
      id: configuredHours._id.toString(),
      operatingHours: { open: "10:00", close: "20:00" },
    });
  });
});
