import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { env } from "../src/config/env.js";
import { User } from "../src/models/User.js";
import {
  createRefreshToken,
  hashRefreshToken,
  parseDurationToMilliseconds,
  signAccessToken,
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

function rawTokenFromCookie(cookie) {
  return cookie?.split(";", 1)[0].slice(env.refreshCookieName.length + 1);
}

async function loginAndGetSession() {
  const response = await request(app)
    .post("/api/v1/auth/login")
    .set("User-Agent", "ESMS initial login")
    .set("X-Forwarded-For", "203.0.113.10")
    .send({ email: EMAIL, password: PASSWORD });
  const cookie = findRefreshCookie(response);
  return { response, cookie, token: rawTokenFromCookie(cookie) };
}

function refresh(cookie, requestSetup) {
  let refreshRequest = request(app)
    .post("/api/v1/auth/refresh")
    .set("User-Agent", "ESMS refresh integration test")
    .set("X-Forwarded-For", "203.0.113.11");

  if (cookie) {
    refreshRequest = refreshRequest.set("Cookie", cookie);
  }

  return requestSetup ? requestSetup(refreshRequest) : refreshRequest.send({});
}

function expectClearedRefreshCookie(response) {
  const cookie = findRefreshCookie(response);
  expect(cookie).toContain(`${env.refreshCookieName}=`);
  expect(cookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("SameSite=Lax");
  expect(cookie).toContain("Path=/api/v1/auth");
}

function expectGenericFailure(response) {
  expect(response.status).toBe(401);
  expect(response.body).toMatchObject({
    success: false,
    message: "Invalid or expired session.",
    details: null,
  });
  expect(JSON.stringify(response.body)).not.toMatch(/accessToken|sessionId|familyId|tokenHash|Mongo/i);
  expectClearedRefreshCookie(response);
}

beforeAll(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 4);
  await connectTestDatabase();
  await User.init();
});

beforeEach(async () => {
  await clearTestCollections([User]);
});

afterAll(async () => {
  await clearTestCollections([User]);
  await disconnectTestDatabase();
});

describe("POST /api/v1/auth/refresh successful rotation", () => {
  it("rotates a valid cookie and returns only a new Access Token and expiry", async () => {
    await createUser();
    const initial = await loginAndGetSession();
    const response = await refresh(initial.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "Token refreshed successfully.",
      data: {
        accessToken: expect.any(String),
        expiresIn: env.jwtAccessExpiresIn,
      },
    });
    expect(response.body.data).not.toHaveProperty("user");
    expect(JSON.stringify(response.body)).not.toContain(initial.token);
  });

  it("sets a new scoped HttpOnly Refresh Cookie with a different token and jti", async () => {
    await createUser();
    const initial = await loginAndGetSession();
    const oldClaims = verifyRefreshToken(initial.token);
    const response = await refresh(initial.cookie);
    const rotatedCookie = findRefreshCookie(response);
    const newToken = rawTokenFromCookie(rotatedCookie);
    const newClaims = verifyRefreshToken(newToken);

    expect(rotatedCookie).toContain("HttpOnly");
    expect(rotatedCookie).toContain("SameSite=Lax");
    expect(rotatedCookie).toContain("Path=/api/v1/auth");
    expect(newToken).not.toBe(initial.token);
    expect(newClaims.jti).not.toBe(oldClaims.jti);
    expect(newClaims.familyId).toBe(oldClaims.familyId);
    expect(newClaims.sid).not.toBe(oldClaims.sid);
  });

  it("revokes and links the old session while storing one active successor hash", async () => {
    await createUser();
    const initial = await loginAndGetSession();
    const oldClaims = verifyRefreshToken(initial.token);
    const startedAt = Date.now();
    const response = await refresh(initial.cookie);
    const finishedAt = Date.now();
    const newToken = rawTokenFromCookie(findRefreshCookie(response));
    const newClaims = verifyRefreshToken(newToken);
    const user = await User.findOne({ email: EMAIL }).select(
      "+refreshSessions +refreshSessions.tokenHash",
    );
    const oldSession = user.refreshSessions.find(({ sessionId }) => sessionId === oldClaims.sid);
    const newSession = user.refreshSessions.find(({ sessionId }) => sessionId === newClaims.sid);
    const lifetime = parseDurationToMilliseconds(env.jwtRefreshExpiresIn);

    expect(oldSession).toMatchObject({
      revokedReason: "rotated",
      replacedBySessionId: newClaims.sid,
    });
    expect(oldSession.revokedAt).toBeInstanceOf(Date);
    expect(oldSession.lastUsedAt).toBeInstanceOf(Date);
    expect(newSession.familyId).toBe(oldSession.familyId);
    expect(newSession.tokenHash).toBe(hashRefreshToken(newToken));
    expect(newSession.tokenHash).not.toBe(newToken);
    expect(newSession.toObject({ transform: false })).not.toHaveProperty("token");
    expect(newSession.expiresAt.getTime()).toBeGreaterThanOrEqual(startedAt + lifetime);
    expect(newSession.expiresAt.getTime()).toBeLessThanOrEqual(finishedAt + lifetime);
    expect(newSession.userAgent).toBe("ESMS refresh integration test");
    expect(newSession.ipAddress).toBe("203.0.113.11");
  });

  it("uses current database authorization in the new Access Token", async () => {
    const branchId = new mongoose.Types.ObjectId();
    const user = await createUser();
    const initial = await loginAndGetSession();
    await User.updateOne(
      { _id: user._id },
      { $set: { role: "administrator", adminLevel: "branch_manager", branchId } },
    );
    const response = await refresh(initial.cookie);
    const accessClaims = verifyAccessToken(response.body.data.accessToken);

    expect(accessClaims).toMatchObject({
      userId: user._id.toString(),
      role: "administrator",
      adminLevel: "branch_manager",
      branchId: branchId.toString(),
      type: "access",
    });
  });

  it("prunes expired sessions and retains non-expired revoked history", async () => {
    await createUser();
    const initial = await loginAndGetSession();
    await User.updateOne(
      { email: EMAIL },
      {
        $push: {
          refreshSessions: {
            $each: [
              {
                sessionId: "expired-history",
                tokenHash: "a".repeat(64),
                familyId: "history",
                createdAt: new Date(Date.now() - 120_000),
                expiresAt: new Date(Date.now() - 60_000),
              },
              {
                sessionId: "revoked-history",
                tokenHash: "b".repeat(64),
                familyId: "history",
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 60_000),
                revokedAt: new Date(),
                revokedReason: "logout",
              },
            ],
          },
        },
      },
    );

    expect((await refresh(initial.cookie)).status).toBe(200);
    const user = await User.findOne({ email: EMAIL }).select("+refreshSessions");
    expect(user.refreshSessions.some(({ sessionId }) => sessionId === "expired-history")).toBe(false);
    expect(user.refreshSessions.some(({ sessionId }) => sessionId === "revoked-history")).toBe(true);
  });
});

describe("invalid refresh sessions", () => {
  it("rejects a missing cookie", async () => {
    expectGenericFailure(await refresh());
  });

  it.each([
    ["malformed token", () => "malformed"],
    ["wrong signature", () => jwt.sign(
      { sid: "s", familyId: "f", jti: "j", type: "refresh" },
      "wrong-secret",
      { algorithm: "HS256", subject: new mongoose.Types.ObjectId().toString(), expiresIn: "1m" },
    )],
    ["Access Token", () => signAccessToken({ userId: new mongoose.Types.ObjectId(), role: "customer" })],
    ["expired token", () => jwt.sign(
      { sid: "s", familyId: "f", jti: "j", type: "refresh" },
      env.jwtRefreshSecret,
      { algorithm: "HS256", subject: new mongoose.Types.ObjectId().toString(), expiresIn: -1 },
    )],
    ["missing required claims", () => jwt.sign(
      { familyId: "f", jti: "j", type: "refresh" },
      env.jwtRefreshSecret,
      { algorithm: "HS256", subject: new mongoose.Types.ObjectId().toString(), expiresIn: "1m" },
    )],
    ["invalid User identifier", () => jwt.sign(
      { sid: "s", familyId: "f", jti: "j", type: "refresh" },
      env.jwtRefreshSecret,
      { algorithm: "HS256", subject: "not-an-object-id", expiresIn: "1m" },
    )],
  ])("rejects %s generically", async (_label, tokenFactory) => {
    const token = tokenFactory();
    expectGenericFailure(await refresh(`${env.refreshCookieName}=${token}`));
  });

  it("rejects an unknown User and unknown session", async () => {
    const unknownUserToken = createRefreshToken({
      userId: new mongoose.Types.ObjectId(),
      sessionId: "unknown",
      familyId: "family",
    });
    expectGenericFailure(await refresh(`${env.refreshCookieName}=${unknownUserToken}`));

    const user = await createUser();
    const unknownSessionToken = createRefreshToken({
      userId: user._id,
      sessionId: "unknown",
      familyId: "family",
    });
    expectGenericFailure(await refresh(`${env.refreshCookieName}=${unknownSessionToken}`));
  });

  it.each([
    ["token hash mismatch", { tokenHash: "c".repeat(64) }],
    ["revoked session", { revokedAt: new Date(), revokedReason: "rotated" }],
    ["expired stored session", { expiresAt: new Date(Date.now() - 1_000) }],
  ])("rejects a %s", async (_label, sessionChange) => {
    await createUser();
    const initial = await loginAndGetSession();
    const claims = verifyRefreshToken(initial.token);
    const set = Object.fromEntries(
      Object.entries(sessionChange).map(([key, value]) => [`refreshSessions.$.${key}`, value]),
    );
    await User.updateOne(
      { email: EMAIL, "refreshSessions.sessionId": claims.sid },
      { $set: set },
    );

    expectGenericFailure(await refresh(initial.cookie));
  });

  it.each([
    ["inactive", new Date(), null, "security_status_changed"],
    ["active", null, null, "security_status_changed"],
    ["locked", new Date(), null, "security_status_changed"],
    ["active", new Date(), new Date(Date.now() + 60_000), "account_locked"],
  ])("rejects ineligible account status %s and revokes active sessions", async (
    status,
    emailVerifiedAt,
    lockedUntil,
    expectedReason,
  ) => {
    await createUser();
    const initial = await loginAndGetSession();
    await User.updateOne({ email: EMAIL }, { $set: { status, emailVerifiedAt, lockedUntil } });

    expectGenericFailure(await refresh(initial.cookie));
    const user = await User.findOne({ email: EMAIL }).select("+refreshSessions");
    expect(user.refreshSessions[0].revokedReason).toBe(expectedReason);
  });

  it("ignores body and Authorization tokens when the cookie is absent", async () => {
    const token = createRefreshToken({
      userId: new mongoose.Types.ObjectId(),
      sessionId: "body-token",
      familyId: "family",
    });
    const bodyResponse = await refresh(null, (refreshRequest) =>
      refreshRequest.send({ refreshToken: token }),
    );
    const headerResponse = await refresh(null, (refreshRequest) =>
      refreshRequest.set("Authorization", `Bearer ${token}`).send({}),
    );

    expectGenericFailure(bodyResponse);
    expectGenericFailure(headerResponse);
  });
});

describe("single-use refresh and concurrency", () => {
  it("rejects reuse without creating another successor", async () => {
    await createUser();
    const initial = await loginAndGetSession();
    expect((await refresh(initial.cookie)).status).toBe(200);
    const countAfterRotation = (await User.findOne({ email: EMAIL }).select("+refreshSessions"))
      .refreshSessions.length;

    expectGenericFailure(await refresh(initial.cookie));
    const finalCount = (await User.findOne({ email: EMAIL }).select("+refreshSessions"))
      .refreshSessions.length;
    expect(finalCount).toBe(countAfterRotation);
  });

  it("allows exactly one of two concurrent rotations and keeps the winner active", async () => {
    await createUser();
    const initial = await loginAndGetSession();
    const oldClaims = verifyRefreshToken(initial.token);
    const responses = await Promise.all([refresh(initial.cookie), refresh(initial.cookie)]);
    const winner = responses.find(({ status }) => status === 200);
    const loser = responses.find(({ status }) => status === 401);

    expect(responses.filter(({ status }) => status === 200)).toHaveLength(1);
    expect(responses.filter(({ status }) => status === 401)).toHaveLength(1);
    expectClearedRefreshCookie(loser);

    const winnerToken = rawTokenFromCookie(findRefreshCookie(winner));
    const winnerClaims = verifyRefreshToken(winnerToken);
    const user = await User.findOne({ email: EMAIL }).select("+refreshSessions");
    const familySessions = user.refreshSessions.filter(
      ({ familyId }) => familyId === oldClaims.familyId,
    );
    const successor = familySessions.find(({ sessionId }) => sessionId === winnerClaims.sid);

    expect(familySessions).toHaveLength(2);
    expect(successor.revokedAt).toBeNull();
    expect(successor.revokedReason).toBeNull();
  });
});
