import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { env } from "../src/config/env.js";
import {
  countActiveRefreshSessions,
  createRefreshSession,
  createRefreshToken,
  generateSecureTokenId,
  getClearRefreshCookieOptions,
  getRefreshCookieOptions,
  hashRefreshToken,
  parseDurationToMilliseconds,
  removeExpiredRefreshSessions,
  selectOldestActiveRefreshSession,
  signAccessToken,
  verifyAccessToken,
  verifyRefreshToken,
  verifyRefreshTokenHash,
} from "../src/utils/token.js";

const user = {
  _id: "507f1f77bcf86cd799439011",
  role: "customer",
  adminLevel: null,
  branchId: null,
  fullName: "Sensitive Name",
  email: "sensitive@example.com",
  passwordHash: "secret-password-hash",
  refreshSessions: [{ tokenHash: "secret-session-hash" }],
};

describe("access-token utility", () => {
  it("signs and verifies only approved custom claims with configured expiry", () => {
    const token = signAccessToken(user);
    const payload = verifyAccessToken(token);
    const customClaims = Object.keys(payload).filter(
      (claim) => !["iat", "exp"].includes(claim),
    );

    expect(customClaims.sort()).toEqual(
      ["adminLevel", "branchId", "role", "type", "userId"].sort(),
    );
    expect(payload).toMatchObject({
      userId: user._id,
      role: "customer",
      adminLevel: null,
      branchId: null,
      type: "access",
    });
    expect((payload.exp - payload.iat) * 1_000).toBe(
      parseDurationToMilliseconds(env.jwtAccessExpiresIn),
    );
    expect(JSON.stringify(payload)).not.toMatch(
      /password|email|fullName|otp|refreshSessions|tokenHash/i,
    );
  });

  it("rejects a wrong signature and an expired token", () => {
    const wrongSignature = jwt.sign(
      { userId: user._id, role: user.role, adminLevel: null, branchId: null, type: "access" },
      "wrong-secret",
      { algorithm: "HS256", expiresIn: "1m" },
    );
    const expired = jwt.sign(
      { userId: user._id, role: user.role, adminLevel: null, branchId: null, type: "access" },
      env.jwtAccessSecret,
      { algorithm: "HS256", expiresIn: -1 },
    );

    expect(() => verifyAccessToken(wrongSignature)).toThrow();
    expect(() => verifyAccessToken(expired)).toThrow();
  });

  it.each([
    [{ role: "customer", adminLevel: null, branchId: null, type: "access" }, "userId"],
    [{ userId: user._id, adminLevel: null, branchId: null, type: "access" }, "role"],
    [{ userId: user._id, role: "customer", adminLevel: null, branchId: null, type: "refresh" }, "type"],
  ])("rejects a token with an invalid required %s claim", (claims) => {
    const token = jwt.sign(claims, env.jwtAccessSecret, {
      algorithm: "HS256",
      expiresIn: "1m",
    });

    expect(() => verifyAccessToken(token)).toThrow();
  });
});

describe("refresh-token utility", () => {
  it("creates and verifies required refresh claims", () => {
    const token = createRefreshToken({
      userId: user._id,
      sessionId: "session-1",
      familyId: "family-1",
    });
    const payload = verifyRefreshToken(token);

    expect(payload).toMatchObject({
      sub: user._id,
      sid: "session-1",
      familyId: "family-1",
      type: "refresh",
    });
    expect(payload.jti).toMatch(/^[\w-]+$/);
    expect((payload.exp - payload.iat) * 1_000).toBe(
      parseDurationToMilliseconds(env.jwtRefreshExpiresIn),
    );
  });

  it("does not allow access and refresh token types to be interchanged", () => {
    const accessToken = signAccessToken(user);
    const refreshToken = createRefreshToken({
      userId: user._id,
      sessionId: "session-1",
      familyId: "family-1",
    });

    expect(() => verifyRefreshToken(accessToken)).toThrow();
    expect(() => verifyAccessToken(refreshToken)).toThrow();
  });

  it("rejects wrong signatures and malformed required claims", () => {
    const wrongSignature = jwt.sign(
      { sub: user._id, sid: "s", familyId: "f", jti: "j", type: "refresh" },
      "wrong-secret",
      { algorithm: "HS256", expiresIn: "1m" },
    );
    const missingSession = jwt.sign(
      { familyId: "f", jti: "j", type: "refresh" },
      env.jwtRefreshSecret,
      { algorithm: "HS256", subject: user._id, expiresIn: "1m" },
    );

    expect(() => verifyRefreshToken(wrongSignature)).toThrow();
    expect(() => verifyRefreshToken(missingSession)).toThrow();
  });

  it("generates non-repeating URL-safe IDs using at least 32 bytes", () => {
    const ids = Array.from({ length: 100 }, () => generateSecureTokenId());

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[\w-]{43}$/.test(id))).toBe(true);
  });

  it("hashes and timing-safely verifies complete refresh tokens", () => {
    const token = createRefreshToken({
      userId: user._id,
      sessionId: "session-1",
      familyId: "family-1",
    });
    const tokenHash = hashRefreshToken(token);

    expect(tokenHash).toMatch(/^[a-f\d]{64}$/);
    expect(tokenHash).not.toBe(token);
    expect(verifyRefreshTokenHash({ token, tokenHash })).toBe(true);
    expect(verifyRefreshTokenHash({ token: `${token}x`, tokenHash })).toBe(false);
    expect(verifyRefreshTokenHash({ token, tokenHash: "malformed" })).toBe(false);
    expect(verifyRefreshTokenHash()).toBe(false);
  });
});

describe("duration and cookie utilities", () => {
  it.each([
    ["3600s", 3_600_000],
    ["15m", 900_000],
    ["24h", 86_400_000],
    ["7d", 604_800_000],
  ])("parses %s without unit ambiguity", (duration, expected) => {
    expect(parseDurationToMilliseconds(duration)).toBe(expected);
  });

  it.each(["", "15", "1w", "1.5h", "-1m", "0s"])(
    "rejects malformed or non-positive duration %s",
    (duration) => {
      expect(() => parseDurationToMilliseconds(duration)).toThrow();
    },
  );

  it("builds secure-by-environment refresh and matching clear-cookie options", () => {
    const options = getRefreshCookieOptions();
    const clearOptions = getClearRefreshCookieOptions();

    expect(options).toEqual({
      httpOnly: true,
      secure: env.nodeEnv === "production",
      sameSite: "lax",
      path: "/api/v1/auth",
      maxAge: parseDurationToMilliseconds(env.jwtRefreshExpiresIn),
    });
    expect(clearOptions).toEqual({
      httpOnly: true,
      secure: options.secure,
      sameSite: options.sameSite,
      path: options.path,
    });
    expect(JSON.stringify({ options, clearOptions })).not.toMatch(/eyJ|token/i);
  });
});

describe("refresh-session helpers", () => {
  const now = new Date("2026-01-10T00:00:00.000Z");
  const sessions = [
    { sessionId: "old", createdAt: new Date("2026-01-01"), expiresAt: new Date("2026-01-20"), revokedAt: null },
    { sessionId: "new", createdAt: new Date("2026-01-02"), expiresAt: new Date("2026-01-20"), revokedAt: null },
    { sessionId: "expired", createdAt: new Date("2026-01-03"), expiresAt: new Date("2026-01-09"), revokedAt: null },
    { sessionId: "revoked", createdAt: new Date("2026-01-04"), expiresAt: new Date("2026-01-20"), revokedAt: new Date("2026-01-05") },
  ];

  it("removes expired sessions and counts only active sessions", () => {
    expect(removeExpiredRefreshSessions(sessions, now).map(({ sessionId }) => sessionId)).not.toContain("expired");
    expect(countActiveRefreshSessions(sessions, now)).toBe(2);
  });

  it("selects the oldest active session", () => {
    expect(selectOldestActiveRefreshSession(sessions, now).sessionId).toBe("old");
  });

  it("creates a persistence-safe session without a raw token field", () => {
    const session = createRefreshSession({
      sessionId: "session-1",
      tokenHash: "a".repeat(64),
      familyId: "family-1",
      createdAt: now,
      expiresAt: new Date("2026-01-20"),
    });

    expect(session).not.toHaveProperty("token");
    expect(session.tokenHash).toBe("a".repeat(64));
  });
});
