import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const JWT_ALGORITHM = "HS256";
const SHA256_HEX_PATTERN = /^[a-f\d]{64}$/i;
const DURATION_PATTERN = /^(\d+)([smhd])$/;
const DURATION_MULTIPLIERS = Object.freeze({
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
});

function requireClaim(payload, claim) {
  if (typeof payload?.[claim] !== "string" || payload[claim].length === 0) {
    throw new jwt.JsonWebTokenError(`Missing or invalid ${claim} claim`);
  }
}

function normalizeId(value, name) {
  const normalized = value?.toString();

  if (!normalized) {
    throw new TypeError(`${name} is required`);
  }

  return normalized;
}

export function signAccessToken(user) {
  const payload = {
    userId: normalizeId(user?._id ?? user?.userId, "userId"),
    role: normalizeId(user?.role, "role"),
    adminLevel: user?.adminLevel?.toString() ?? null,
    branchId: user?.branchId?.toString() ?? null,
    type: "access",
  };

  return jwt.sign(payload, env.jwtAccessSecret, {
    algorithm: JWT_ALGORITHM,
    expiresIn: env.jwtAccessExpiresIn,
  });
}

export function verifyAccessToken(token, options = {}) {
  const payload = jwt.verify(token, env.jwtAccessSecret, {
    ...options,
    algorithms: [JWT_ALGORITHM],
  });

  if (payload.type !== "access") {
    throw new jwt.JsonWebTokenError("Invalid token type");
  }

  requireClaim(payload, "userId");
  requireClaim(payload, "role");

  if (!(payload.adminLevel === null || typeof payload.adminLevel === "string")) {
    throw new jwt.JsonWebTokenError("Invalid adminLevel claim");
  }

  if (!(payload.branchId === null || typeof payload.branchId === "string")) {
    throw new jwt.JsonWebTokenError("Invalid branchId claim");
  }

  return payload;
}

export function generateSecureTokenId() {
  return randomBytes(32).toString("base64url");
}

export function createRefreshToken({ userId, sessionId, familyId } = {}) {
  return jwt.sign(
    {
      sid: normalizeId(sessionId, "sessionId"),
      familyId: normalizeId(familyId, "familyId"),
      jti: generateSecureTokenId(),
      type: "refresh",
    },
    env.jwtRefreshSecret,
    {
      algorithm: JWT_ALGORITHM,
      subject: normalizeId(userId, "userId"),
      expiresIn: env.jwtRefreshExpiresIn,
    },
  );
}

export function verifyRefreshToken(token, options = {}) {
  const payload = jwt.verify(token, env.jwtRefreshSecret, {
    ...options,
    algorithms: [JWT_ALGORITHM],
  });

  if (payload.type !== "refresh") {
    throw new jwt.JsonWebTokenError("Invalid token type");
  }

  for (const claim of ["sub", "sid", "familyId", "jti"]) {
    requireClaim(payload, claim);
  }

  return payload;
}

export function hashRefreshToken(token) {
  if (typeof token !== "string" || token.length === 0) {
    throw new TypeError("token is required");
  }

  return createHash("sha256").update(token).digest("hex");
}

export function verifyRefreshTokenHash({ token, tokenHash } = {}) {
  if (typeof token !== "string" || !SHA256_HEX_PATTERN.test(tokenHash ?? "")) {
    return false;
  }

  const candidateHash = hashRefreshToken(token);
  return timingSafeEqual(Buffer.from(candidateHash, "hex"), Buffer.from(tokenHash, "hex"));
}

export function parseDurationToMilliseconds(value) {
  if (typeof value !== "string") {
    throw new TypeError("Duration must be a string with a supported unit");
  }

  const match = value.match(DURATION_PATTERN);

  if (!match) {
    throw new TypeError("Duration must be a positive integer followed by s, m, h, or d");
  }

  const amount = Number(match[1]);
  const milliseconds = amount * DURATION_MULTIPLIERS[match[2]];

  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) {
    throw new RangeError("Duration must resolve to a positive safe integer");
  }

  return milliseconds;
}

export function getRefreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    path: "/api/v1/auth",
    maxAge: parseDurationToMilliseconds(env.jwtRefreshExpiresIn),
  };
}

export function getClearRefreshCookieOptions() {
  const { secure, sameSite, path } = getRefreshCookieOptions();
  return { httpOnly: true, secure, sameSite, path };
}

export function removeExpiredRefreshSessions(sessions = [], now = new Date()) {
  return sessions.filter((session) => new Date(session.expiresAt) > now);
}

export function countActiveRefreshSessions(sessions = [], now = new Date()) {
  return sessions.filter(
    (session) => session.revokedAt == null && new Date(session.expiresAt) > now,
  ).length;
}

export function selectOldestActiveRefreshSession(sessions = [], now = new Date()) {
  return sessions
    .filter((session) => session.revokedAt == null && new Date(session.expiresAt) > now)
    .reduce(
      (oldest, session) =>
        !oldest || new Date(session.createdAt) < new Date(oldest.createdAt) ? session : oldest,
      null,
    );
}

export function createRefreshSession({
  sessionId,
  tokenHash,
  familyId,
  createdAt = new Date(),
  expiresAt,
  userAgent = null,
  ipAddress = null,
} = {}) {
  if (!SHA256_HEX_PATTERN.test(tokenHash ?? "")) {
    throw new TypeError("tokenHash must be a SHA-256 hexadecimal hash");
  }

  return {
    sessionId: normalizeId(sessionId, "sessionId"),
    tokenHash,
    familyId: normalizeId(familyId, "familyId"),
    createdAt: new Date(createdAt),
    lastUsedAt: null,
    expiresAt: new Date(expiresAt),
    revokedAt: null,
    revokedReason: null,
    replacedBySessionId: null,
    userAgent,
    ipAddress,
  };
}
