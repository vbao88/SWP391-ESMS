import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../src/config/env.js";
import { authenticate } from "../src/middlewares/auth.middleware.js";
import { requireSuperAdmin } from "../src/middlewares/authorization.middleware.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";
import { User } from "../src/models/User.js";
import { app as productionApp } from "../src/app.js";
import { createRefreshToken, signAccessToken } from "../src/utils/token.js";
import {
  clearTestCollections,
  connectTestDatabase,
  disconnectTestDatabase,
} from "./helpers/database.js";

const probeApp = express();
probeApp.get("/protected-test", authenticate, requireSuperAdmin, (_request, response) => {
  response.status(200).json({ success: true });
});
probeApp.use(errorHandler);

let fixtureNumber = 0;

function userFixture(overrides = {}) {
  fixtureNumber += 1;
  return {
    fullName: "Authorization Test User",
    email: `authorization-${fixtureNumber}@example.com`,
    passwordHash: "test-password-hash",
    role: "administrator",
    adminLevel: "super_admin",
    status: "active",
    ...overrides,
  };
}

function bearer(token) {
  return request(probeApp).get("/protected-test").set("Authorization", `Bearer ${token}`);
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

function expectGenericPermissionDenial(response) {
  expect(response.status).toBe(403);
  expect(response.body).toMatchObject({
    success: false,
    message: "Insufficient permission",
    details: null,
  });
  expect(response.body).not.toHaveProperty("status");
  expect(response.body).not.toHaveProperty("role");
  expect(response.body).not.toHaveProperty("adminLevel");
}

beforeAll(async () => {
  await connectTestDatabase();
  await User.init();
});

beforeEach(async () => {
  vi.restoreAllMocks();
  await clearTestCollections([User]);
});

afterAll(async () => {
  vi.restoreAllMocks();
  await clearTestCollections([User]);
  await disconnectTestDatabase();
});

describe("current-user Super Administrator authorization", () => {
  it("returns 401 when the Access Token is missing", async () => {
    const response = await request(probeApp).get("/protected-test");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Authentication required");
  });

  it.each(["not-a-jwt", "signed-with-wrong-secret"])(
    "returns 401 for an invalid Bearer token: %s",
    async (kind) => {
      const token =
        kind === "not-a-jwt"
          ? kind
          : jwt.sign({ userId: new mongoose.Types.ObjectId(), role: "administrator", type: "access" }, "wrong-secret");
      const response = await bearer(token);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe("Invalid or expired access token");
    },
  );

  it("returns 401 for an expired Access Token", async () => {
    const token = jwt.sign(
      {
        userId: new mongoose.Types.ObjectId().toString(),
        role: "administrator",
        adminLevel: "super_admin",
        branchId: null,
        type: "access",
      },
      env.jwtAccessSecret,
      { algorithm: "HS256", expiresIn: -1 },
    );

    const response = await bearer(token);
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid or expired access token");
  });

  it("returns 401 when a Refresh Token is used as Bearer", async () => {
    const response = await bearer(
      createRefreshToken({
        userId: new mongoose.Types.ObjectId(),
        sessionId: "authorization-session",
        familyId: "authorization-family",
      }),
    );

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid or expired access token");
  });

  it("returns 401 when the verified userId is invalid or the current User was deleted", async () => {
    const malformedIdToken = signAccessToken({
      _id: "not-an-object-id",
      role: "administrator",
      adminLevel: "super_admin",
    });
    const deletedUserToken = signAccessToken({
      _id: new mongoose.Types.ObjectId(),
      role: "administrator",
      adminLevel: "super_admin",
    });

    for (const token of [malformedIdToken, deletedUserToken]) {
      const response = await bearer(token);
      expect(response.status).toBe(401);
      expect(response.body.message).toBe("Invalid or expired access token");
    }
  });

  it.each([
    ["customer", { role: "customer", adminLevel: null }],
    ["sales staff", { role: "sales_staff", adminLevel: null }],
    ["prescription staff", { role: "prescription_staff", adminLevel: null }],
    ["branch manager", { role: "administrator", adminLevel: "branch_manager" }],
    ["administrator with null adminLevel", { role: "administrator", adminLevel: null }],
  ])("returns generic 403 for an active %s", async (_label, overrides) => {
    const user = await User.create(userFixture(overrides));
    const response = await bearer(tokenFor(user));

    expectGenericPermissionDenial(response);
  });

  it.each([
    ["missing", { $unset: { adminLevel: "" } }],
    ["unknown", { $set: { adminLevel: "unknown_admin_level" } }],
  ])("returns generic 403 for an administrator with %s adminLevel", async (_label, update) => {
    const user = await User.create(userFixture());
    await User.collection.updateOne({ _id: user._id }, update);

    const response = await bearer(tokenFor(user));
    expectGenericPermissionDenial(response);
  });

  it.each(["locked", "inactive", "pending_activation"])(
    "returns generic 403 for a current User with %s status",
    async (status) => {
      const user = await User.create(userFixture({ status }));
      const response = await bearer(tokenFor(user));

      expectGenericPermissionDenial(response);
    },
  );

  it("allows an active administrator with super_admin level", async () => {
    const user = await User.create(userFixture());
    const findByIdSpy = vi.spyOn(User, "findById");
    const response = await bearer(tokenFor(user));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(findByIdSpy).toHaveBeenCalledWith(user._id.toString(), "status role adminLevel");
  });

  it.each([
    ["role", { role: "customer", adminLevel: null }],
    ["adminLevel", { role: "administrator", adminLevel: "branch_manager" }],
    ["status", { status: "locked" }],
  ])("uses current database %s instead of stale super_admin JWT claims", async (_field, downgrade) => {
    const user = await User.create(userFixture());
    const staleToken = tokenFor(user);
    await User.findByIdAndUpdate(user._id, downgrade);

    const response = await bearer(staleToken);
    expectGenericPermissionDenial(response);
  });

  it("uses an eligible current User as the final authority despite stale insufficient JWT claims", async () => {
    const user = await User.create(userFixture());
    const response = await bearer(
      tokenFor(user, { role: "customer", adminLevel: null }),
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
  });

  it("forwards unexpected database lookup errors to the global 500 handler", async () => {
    const user = await User.create(userFixture());
    vi.spyOn(User, "findById").mockReturnValue({
      lean: vi.fn().mockRejectedValue(new Error("database unavailable")),
    });

    const response = await bearer(tokenFor(user));
    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Internal server error");
  });

  it("does not perform current-user authorization lookup for public Branch routes", async () => {
    const lookupSpy = vi.spyOn(User, "findById");

    for (const token of [undefined, "invalid-access-token"]) {
      const pendingRequest = request(productionApp).get("/api/v1/branches");
      if (token) pendingRequest.set("Authorization", `Bearer ${token}`);
      const response = await pendingRequest;
      expect(response.status).toBe(200);
    }

    expect(lookupSpy).not.toHaveBeenCalled();
  });
});
