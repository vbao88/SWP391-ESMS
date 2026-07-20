import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { env } from "../src/config/env.js";
import { User } from "../src/models/User.js";
import {
  countActiveRefreshSessions,
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
const WRONG_PASSWORD = "WrongPassword123";
let passwordHash;

function login(payload = { email: EMAIL, password: PASSWORD }) {
  return request(app)
    .post("/api/v1/auth/login")
    .set("User-Agent", "ESMS login integration test")
    .set("X-Forwarded-For", "203.0.113.10")
    .send(payload);
}

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

function refreshCookie(response) {
  return response.headers["set-cookie"]?.find((cookie) =>
    cookie.startsWith(`${env.refreshCookieName}=`),
  );
}

function rawRefreshToken(response) {
  return refreshCookie(response)?.split(";", 1)[0].slice(env.refreshCookieName.length + 1);
}

function sessionFixture({
  sessionId,
  createdAt,
  expiresAt = new Date(Date.now() + 60 * 60_000),
  revokedAt = null,
  revokedReason = null,
} = {}) {
  return {
    sessionId,
    tokenHash: hashRefreshToken(`fixture-${sessionId}`),
    familyId: `family-${sessionId}`,
    createdAt,
    lastUsedAt: null,
    expiresAt,
    revokedAt,
    revokedReason,
    replacedBySessionId: null,
    userAgent: null,
    ipAddress: null,
  };
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

describe("POST /api/v1/auth/login success", () => {
  it("logs in an active verified customer and normalizes email", async () => {
    await createUser();
    const response = await login({ email: "  BAO@EXAMPLE.COM ", password: PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Login successful.");
    expect(response.body.data.expiresIn).toBe(env.jwtAccessExpiresIn);
  });

  it("returns an Access Token with only approved custom claims", async () => {
    await createUser();
    const response = await login();
    const payload = verifyAccessToken(response.body.data.accessToken);
    const customClaims = Object.keys(payload).filter((claim) => !["iat", "exp"].includes(claim));

    expect(customClaims.sort()).toEqual(
      ["userId", "role", "adminLevel", "branchId", "type"].sort(),
    );
  });

  it("returns only the approved safe User fields", async () => {
    const user = await createUser();
    const response = await login();

    expect(response.body.data.user).toEqual({
      id: user._id.toString(),
      fullName: "Le Van Bao",
      email: EMAIL,
      role: "customer",
      adminLevel: null,
      branchId: null,
      status: "active",
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /passwordHash|refreshSessions|failedLoginAttempts|lockedUntil|tokenHash|otp/i,
    );
  });

  it("sets only the configured HttpOnly SameSite Lax scoped Refresh Cookie", async () => {
    await createUser();
    const response = await login();
    const cookie = refreshCookie(response);

    expect(cookie).toContain(`${env.refreshCookieName}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/api/v1/auth");
    expect(JSON.stringify(response.body)).not.toContain(rawRefreshToken(response));
  });

  it("stores one active Refresh Session with only the token hash and safe metadata", async () => {
    await createUser();
    const response = await login();
    const token = rawRefreshToken(response);
    const user = await User.findOne({ email: EMAIL }).select(
      "+refreshSessions +refreshSessions.tokenHash",
    );
    const session = user.refreshSessions[0];
    const refreshPayload = verifyRefreshToken(token);

    expect(countActiveRefreshSessions(user.refreshSessions)).toBe(1);
    expect(session.sessionId).toBe(refreshPayload.sid);
    expect(session.familyId).toBe(refreshPayload.familyId);
    expect(session.tokenHash).toBe(hashRefreshToken(token));
    expect(session.tokenHash).not.toBe(token);
    expect(session.toObject({ transform: false })).not.toHaveProperty("token");
    expect(session.userAgent).toBe("ESMS login integration test");
    expect(session.ipAddress).toBe("203.0.113.10");
  });

  it("resets previous failures and an expired temporary lock", async () => {
    await createUser({
      failedLoginAttempts: 5,
      lockedUntil: new Date(Date.now() - 1_000),
    });

    expect((await login()).status).toBe(200);
    const user = await User.findOne({ email: EMAIL });
    expect(user.failedLoginAttempts).toBe(0);
    expect(user.lockedUntil).toBeNull();
  });
});

describe("generic login failures", () => {
  const genericBody = {
    success: false,
    message: "Invalid email or password.",
    details: null,
  };

  async function expectGenericFailure(response) {
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject(genericBody);
    expect(response.body).not.toHaveProperty("data");
    expect(refreshCookie(response)).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toMatch(/accessToken|refresh|locked|pending|inactive/i);
  }

  it("uses dummy bcrypt work and the generic response for an unknown email", async () => {
    const compareSpy = vi.spyOn(bcrypt, "compare");
    const response = await login();

    await expectGenericFailure(response);
    expect(compareSpy).toHaveBeenCalledOnce();
    expect(compareSpy.mock.calls[0][1]).toMatch(/^\$2[aby]\$12\$/);
  });

  it("uses the identical generic response for a wrong password", async () => {
    await createUser();
    await expectGenericFailure(await login({ email: EMAIL, password: WRONG_PASSWORD }));
  });

  it.each([
    ["pending_activation", null],
    ["active", null],
    ["inactive", new Date()],
    ["locked", new Date()],
  ])("rejects ineligible status %s without revealing state", async (status, emailVerifiedAt) => {
    await createUser({ status, emailVerifiedAt });
    await expectGenericFailure(await login());
  });

  it("rejects a temporarily locked account without incrementing or extending its lock", async () => {
    const lockedUntil = new Date(Date.now() + 10 * 60_000);
    await createUser({ failedLoginAttempts: 5, lockedUntil });

    await expectGenericFailure(await login());
    const user = await User.findOne({ email: EMAIL });
    expect(user.failedLoginAttempts).toBe(5);
    expect(user.lockedUntil.getTime()).toBe(lockedUntil.getTime());
  });
});

describe("failed attempts and temporary lock", () => {
  it("increments failures and leaves the first four attempts unlocked", async () => {
    await createUser();

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      expect((await login({ email: EMAIL, password: WRONG_PASSWORD })).status).toBe(401);
      const user = await User.findOne({ email: EMAIL });
      expect(user.failedLoginAttempts).toBe(attempt);
      expect(user.lockedUntil).toBeNull();
    }
  });

  it("locks on the fifth failure for the configured duration without changing status", async () => {
    await createUser({ failedLoginAttempts: 4 });
    const startedAt = Date.now();
    const response = await login({ email: EMAIL, password: WRONG_PASSWORD });
    const finishedAt = Date.now();
    const user = await User.findOne({ email: EMAIL });
    const duration = env.accountLockMinutes * 60_000;

    expect(response.status).toBe(401);
    expect(user.failedLoginAttempts).toBe(5);
    expect(user.lockedUntil.getTime()).toBeGreaterThanOrEqual(startedAt + duration);
    expect(user.lockedUntil.getTime()).toBeLessThanOrEqual(finishedAt + duration);
    expect(user.status).toBe("active");
  });

  it("rejects the correct password during the lock without extending it", async () => {
    const lockedUntil = new Date(Date.now() + 10 * 60_000);
    await createUser({ failedLoginAttempts: 5, lockedUntil });
    const response = await login();
    const user = await User.findOne({ email: EMAIL });

    expect(response.status).toBe(401);
    expect(user.failedLoginAttempts).toBe(5);
    expect(user.lockedUntil.getTime()).toBe(lockedUntil.getTime());
  });

  it("treats a wrong password after lock expiry as the first new failure", async () => {
    await createUser({ failedLoginAttempts: 5, lockedUntil: new Date(Date.now() - 1_000) });
    await login({ email: EMAIL, password: WRONG_PASSWORD });
    const user = await User.findOne({ email: EMAIL });

    expect(user.failedLoginAttempts).toBe(1);
    expect(user.lockedUntil).toBeNull();
  });

  it("revokes active sessions with account_locked on the fifth failure", async () => {
    const active = sessionFixture({ sessionId: "active", createdAt: new Date() });
    const revoked = sessionFixture({
      sessionId: "revoked",
      createdAt: new Date(),
      revokedAt: new Date(Date.now() - 1_000),
      revokedReason: "logout",
    });
    await createUser({ failedLoginAttempts: 4, refreshSessions: [active, revoked] });
    await login({ email: EMAIL, password: WRONG_PASSWORD });
    const user = await User.findOne({ email: EMAIL }).select("+refreshSessions");

    expect(user.refreshSessions[0].revokedReason).toBe("account_locked");
    expect(user.refreshSessions[0].revokedAt).toBeInstanceOf(Date);
    expect(user.refreshSessions[1].revokedReason).toBe("logout");
  });

  it("handles concurrent failures without lost increments or exceeding five", async () => {
    await createUser();
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => login({ email: EMAIL, password: WRONG_PASSWORD })),
    );
    const user = await User.findOne({ email: EMAIL });

    expect(responses.every(({ status }) => status === 401)).toBe(true);
    expect(user.failedLoginAttempts).toBe(5);
    expect(user.lockedUntil).toBeInstanceOf(Date);
  });
});

describe("login session cleanup and limit", () => {
  it("prunes expired sessions but retains non-expired revoked sessions", async () => {
    const expired = sessionFixture({
      sessionId: "expired",
      createdAt: new Date(Date.now() - 120_000),
      expiresAt: new Date(Date.now() - 60_000),
    });
    const revoked = sessionFixture({
      sessionId: "revoked",
      createdAt: new Date(),
      revokedAt: new Date(),
      revokedReason: "logout",
    });
    await createUser({ refreshSessions: [expired, revoked] });
    await login();
    const user = await User.findOne({ email: EMAIL }).select("+refreshSessions");

    expect(user.refreshSessions.some(({ sessionId }) => sessionId === "expired")).toBe(false);
    expect(user.refreshSessions.some(({ sessionId }) => sessionId === "revoked")).toBe(true);
  });

  it("revokes the oldest active session when adding one would exceed the limit", async () => {
    const sessions = Array.from({ length: env.maxActiveRefreshSessions }, (_, index) =>
      sessionFixture({
        sessionId: `session-${index}`,
        createdAt: new Date(Date.now() - (env.maxActiveRefreshSessions - index) * 1_000),
      }),
    );
    await createUser({ refreshSessions: sessions });
    await login();
    const user = await User.findOne({ email: EMAIL }).select("+refreshSessions");

    expect(countActiveRefreshSessions(user.refreshSessions)).toBe(env.maxActiveRefreshSessions);
    const oldest = user.refreshSessions.find(({ sessionId }) => sessionId === "session-0");
    expect(oldest.revokedReason).toBe("session_limit");
    expect(oldest.revokedAt).toBeInstanceOf(Date);
  });

  it("sets no cookie or token response when session persistence fails", async () => {
    await createUser();
    vi.spyOn(User, "updateOne").mockResolvedValue({ modifiedCount: 0 });
    const response = await login();

    expect(response.status).toBe(503);
    expect(refreshCookie(response)).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toMatch(/accessToken|eyJ/);
  });
});

describe("login validation and injection resistance", () => {
  it.each([
    [{ email: "invalid", password: PASSWORD }],
    [{ email: EMAIL }],
    [{ email: EMAIL, password: "x".repeat(73) }],
  ])("rejects malformed input with HTTP 400", async (payload) => {
    const response = await login(payload);
    expect(response.status).toBe(400);
    expect(refreshCookie(response)).toBeUndefined();
  });

  it("strips injected account and session fields", async () => {
    await createUser();
    const response = await login({
      email: EMAIL,
      password: PASSWORD,
      role: "administrator",
      status: "locked",
      adminLevel: "super_admin",
      branchId: "507f191e810c19729de860ea",
      failedLoginAttempts: 99,
      lockedUntil: new Date().toISOString(),
      refreshSessions: [{ token: "raw" }],
    });
    const user = await User.findOne({ email: EMAIL });

    expect(response.status).toBe(200);
    expect(response.body.data.user.role).toBe("customer");
    expect(user.status).toBe("active");
  });
});
