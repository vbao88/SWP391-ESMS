import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { env } from "../src/config/env.js";
import { User } from "../src/models/User.js";
import {
  createRefreshToken,
  hashRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../src/utils/token.js";
import {
  clearTestCollections,
  connectTestDatabase,
  disconnectTestDatabase,
} from "./helpers/database.js";

const EMAIL = "bao@example.com";
const PASSWORD = "Password123";
let passwordHash;

async function createUser(overrides = {}) {
  return User.create({
    fullName: "Le Van Bao",
    email: EMAIL,
    passwordHash,
    role: "customer",
    adminLevel: null,
    branchId: null,
    status: "active",
    emailVerifiedAt: new Date(),
    failedLoginAttempts: 0,
    lockedUntil: null,
    refreshSessions: [],
    ...overrides,
  });
}

function findRefreshCookie(response) {
  return response.headers["set-cookie"]?.find((cookie) =>
    cookie.startsWith(`${env.refreshCookieName}=`),
  );
}

function rawToken(cookie) {
  return cookie?.split(";", 1)[0].slice(env.refreshCookieName.length + 1);
}

async function login() {
  const response = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: EMAIL, password: PASSWORD });
  return {
    response,
    accessToken: response.body.data.accessToken,
    cookie: findRefreshCookie(response),
    token: rawToken(findRefreshCookie(response)),
  };
}

function logout(cookie, setup) {
  let logoutRequest = request(app).post("/api/v1/auth/logout");

  if (cookie) {
    logoutRequest = logoutRequest.set("Cookie", cookie);
  }

  return setup ? setup(logoutRequest) : logoutRequest.send({});
}

function expectClearedCookie(response) {
  const cookie = findRefreshCookie(response);
  expect(cookie).toContain(`${env.refreshCookieName}=`);
  expect(cookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("SameSite=Lax");
  expect(cookie).toContain("Path=/api/v1/auth");
}

function expectSuccessfulLogout(response) {
  expect(response.status).toBe(200);
  expect(response.body).toEqual({
    success: true,
    message: "Logout successful.",
    data: null,
  });
  expectClearedCookie(response);
  expect(JSON.stringify(response.body)).not.toMatch(/token|session|hash|family|sid/i);
}

beforeAll(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 4);
  await connectTestDatabase();
  await User.init();
});

beforeEach(async () => {
  await clearTestCollections([User]);
  vi.restoreAllMocks();
});

afterAll(async () => {
  await clearTestCollections([User]);
  await disconnectTestDatabase();
});

describe("POST /api/v1/auth/logout successful revocation", () => {
  it("revokes only the presented session and returns the exact idempotent contract", async () => {
    await createUser();
    const initial = await login();
    const claims = verifyRefreshToken(initial.token);
    const response = await logout(initial.cookie);
    const user = await User.findOne({ email: EMAIL }).select("+refreshSessions");
    const session = user.refreshSessions.find(({ sessionId }) => sessionId === claims.sid);

    expectSuccessfulLogout(response);
    expect(session.revokedReason).toBe("logout");
    expect(session.revokedAt).toBeInstanceOf(Date);
    expect(session.lastUsedAt).toBeInstanceOf(Date);
    expect(session.replacedBySessionId).toBeNull();
  });

  it("prevents the revoked token from refreshing", async () => {
    await createUser();
    const initial = await login();
    await logout(initial.cookie);
    const refreshResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", initial.cookie)
      .send({});

    expect(refreshResponse.status).toBe(401);
    expect(refreshResponse.body.message).toBe("Invalid or expired session.");
  });

  it("does not revoke or blacklist an already-issued Access Token", async () => {
    await createUser();
    const initial = await login();
    await logout(initial.cookie);

    expect(verifyAccessToken(initial.accessToken).userId).toBeDefined();
  });

  it("does not change User authorization or security fields", async () => {
    const branchId = new mongoose.Types.ObjectId();
    const verifiedAt = new Date(Date.now() - 60_000);
    await createUser({ branchId, emailVerifiedAt: verifiedAt, failedLoginAttempts: 2 });
    const initial = await login();
    await User.updateOne({ email: EMAIL }, { $set: { failedLoginAttempts: 2 } });
    await logout(initial.cookie);
    const user = await User.findOne({ email: EMAIL }).select("+passwordHash");

    expect(user).toMatchObject({
      role: "customer",
      adminLevel: null,
      status: "active",
      failedLoginAttempts: 2,
      lockedUntil: null,
    });
    expect(user.branchId).toEqual(branchId);
    expect(user.emailVerifiedAt.getTime()).toBe(verifiedAt.getTime());
    expect(user.passwordHash).toBe(passwordHash);
  });
});

describe("idempotent logout", () => {
  it("succeeds and clears the cookie when it is missing", async () => {
    expectSuccessfulLogout(await logout());
  });

  it.each([
    ["malformed token", () => "malformed"],
    ["wrong-signature token", () => jwt.sign(
      { sid: "s", familyId: "f", jti: "j", type: "refresh" },
      "wrong-secret",
      { algorithm: "HS256", subject: new mongoose.Types.ObjectId().toString() },
    )],
    ["Access Token", () => jwt.sign(
      { userId: new mongoose.Types.ObjectId().toString(), role: "customer", adminLevel: null, branchId: null, type: "access" },
      env.jwtAccessSecret,
      { algorithm: "HS256", expiresIn: "1m" },
    )],
    ["token with missing claims", () => jwt.sign(
      { familyId: "f", jti: "j", type: "refresh" },
      env.jwtRefreshSecret,
      { algorithm: "HS256", subject: new mongoose.Types.ObjectId().toString(), expiresIn: "1m" },
    )],
  ])("succeeds for a %s", async (_label, tokenFactory) => {
    expectSuccessfulLogout(
      await logout(`${env.refreshCookieName}=${tokenFactory()}`),
    );
  });

  it("succeeds for unknown User and unknown session", async () => {
    const unknownUserToken = createRefreshToken({
      userId: new mongoose.Types.ObjectId(),
      sessionId: "unknown",
      familyId: "family",
    });
    expectSuccessfulLogout(
      await logout(`${env.refreshCookieName}=${unknownUserToken}`),
    );

    const user = await createUser();
    const unknownSessionToken = createRefreshToken({
      userId: user._id,
      sessionId: "unknown",
      familyId: "family",
    });
    expectSuccessfulLogout(
      await logout(`${env.refreshCookieName}=${unknownSessionToken}`),
    );
  });

  it.each([
    ["hash mismatch", { tokenHash: "a".repeat(64) }],
    ["already revoked session", { revokedAt: new Date(), revokedReason: "rotated" }],
  ])("succeeds for %s without changing the session again", async (_label, change) => {
    await createUser();
    const initial = await login();
    const claims = verifyRefreshToken(initial.token);
    const set = Object.fromEntries(
      Object.entries(change).map(([key, value]) => [`refreshSessions.$.${key}`, value]),
    );
    await User.updateOne(
      { email: EMAIL, "refreshSessions.sessionId": claims.sid },
      { $set: set },
    );
    const before = await User.findOne({ email: EMAIL }).select("+refreshSessions");

    expectSuccessfulLogout(await logout(initial.cookie));
    const after = await User.findOne({ email: EMAIL }).select("+refreshSessions");
    expect(after.refreshSessions[0].revokedAt?.getTime() ?? null).toBe(
      before.refreshSessions[0].revokedAt?.getTime() ?? null,
    );
  });

  it("repeated logout succeeds", async () => {
    await createUser();
    const initial = await login();
    expectSuccessfulLogout(await logout(initial.cookie));
    expectSuccessfulLogout(await logout(initial.cookie));
  });

  it("verifies and revokes a correctly signed expired Refresh Token", async () => {
    const user = await createUser();
    const sessionId = "expired-token-session";
    const familyId = "expired-token-family";
    const token = jwt.sign(
      { sid: sessionId, familyId, jti: "expired-jti", type: "refresh" },
      env.jwtRefreshSecret,
      { algorithm: "HS256", subject: user._id.toString(), expiresIn: -1 },
    );
    await User.updateOne(
      { _id: user._id },
      {
        $push: {
          refreshSessions: {
            sessionId,
            tokenHash: hashRefreshToken(token),
            familyId,
            createdAt: new Date(Date.now() - 60_000),
            expiresAt: new Date(Date.now() + 60_000),
          },
        },
      },
    );

    expectSuccessfulLogout(await logout(`${env.refreshCookieName}=${token}`));
    const updated = await User.findById(user._id).select("+refreshSessions");
    expect(updated.refreshSessions[0].revokedReason).toBe("logout");
  });
});

describe("logout security and isolation", () => {
  it("does not trust an unverified sid or revoke its targeted session", async () => {
    await createUser();
    const initial = await login();
    const claims = verifyRefreshToken(initial.token);
    const forged = jwt.sign(
      { sid: claims.sid, familyId: claims.familyId, jti: "forged", type: "refresh" },
      "wrong-secret",
      { algorithm: "HS256", subject: claims.sub, expiresIn: "1m" },
    );

    expectSuccessfulLogout(await logout(`${env.refreshCookieName}=${forged}`));
    const user = await User.findOne({ email: EMAIL }).select("+refreshSessions");
    expect(user.refreshSessions[0].revokedAt).toBeNull();
  });

  it("does not revoke another User session or another session in the same family", async () => {
    const firstUser = await createUser();
    const initial = await login();
    const claims = verifyRefreshToken(initial.token);
    await User.updateOne(
      { _id: firstUser._id },
      {
        $push: {
          refreshSessions: {
            sessionId: "same-family-other-session",
            tokenHash: "b".repeat(64),
            familyId: claims.familyId,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 60_000),
          },
        },
      },
    );
    const secondUser = await User.create({
      fullName: "Other User",
      email: "other@example.com",
      passwordHash,
      role: "customer",
      status: "active",
      emailVerifiedAt: new Date(),
      refreshSessions: [{
        sessionId: "other-user-session",
        tokenHash: "c".repeat(64),
        familyId: "other-family",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      }],
    });

    await logout(initial.cookie);
    const updatedFirst = await User.findById(firstUser._id).select("+refreshSessions");
    const updatedSecond = await User.findById(secondUser._id).select("+refreshSessions");
    expect(updatedFirst.refreshSessions.find(({ sessionId }) => sessionId === "same-family-other-session").revokedAt).toBeNull();
    expect(updatedSecond.refreshSessions[0].revokedAt).toBeNull();
  });

  it("does not accept a Refresh Token from body, query, or Authorization header", async () => {
    await createUser();
    const initial = await login();
    const responses = await Promise.all([
      logout(null, (logoutRequest) => logoutRequest.send({ refreshToken: initial.token })),
      logout(null, (logoutRequest) => logoutRequest.query({ refreshToken: initial.token }).send({})),
      logout(null, (logoutRequest) => logoutRequest.set("Authorization", `Bearer ${initial.token}`).send({})),
    ]);

    responses.forEach(expectSuccessfulLogout);
    const user = await User.findOne({ email: EMAIL }).select("+refreshSessions");
    expect(user.refreshSessions[0].revokedAt).toBeNull();
  });

  it("clears the cookie even when an unexpected database error occurs", async () => {
    await createUser();
    const initial = await login();
    vi.spyOn(User, "findById").mockImplementationOnce(() => {
      throw new Error("database unavailable");
    });
    const response = await logout(initial.cookie);

    expect(response.status).toBe(503);
    expect(response.body.message).toBe("Logout could not be completed. Please try again.");
    expect(JSON.stringify(response.body)).not.toContain("database unavailable");
    expectClearedCookie(response);
  });
});

describe("concurrent logout", () => {
  it("allows two concurrent requests to succeed while revoking exactly one session", async () => {
    await createUser();
    const initial = await login();
    const responses = await Promise.all([logout(initial.cookie), logout(initial.cookie)]);
    responses.forEach(expectSuccessfulLogout);
    const user = await User.findOne({ email: EMAIL }).select("+refreshSessions");

    expect(user.refreshSessions).toHaveLength(1);
    expect(user.refreshSessions[0].revokedReason).toBe("logout");
    expect(user.refreshSessions[0].revokedAt).toBeInstanceOf(Date);
  });
});
