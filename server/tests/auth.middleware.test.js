import { describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { env } from "../src/config/env.js";
import { authenticate, authorizeRoles } from "../src/middlewares/auth.middleware.js";
import { createRefreshToken, signAccessToken } from "../src/utils/token.js";

const user = {
  _id: "507f1f77bcf86cd799439011",
  role: "administrator",
  adminLevel: "branch_manager",
  branchId: "507f191e810c19729de860ea",
};

function runAuthenticate(authorization) {
  const request = { headers: authorization === undefined ? {} : { authorization } };
  const next = vi.fn();
  authenticate(request, {}, next);
  return { request, next, result: next.mock.calls[0]?.[0] };
}

describe("authenticate", () => {
  it("accepts an Access Token and attaches only normalized claims", () => {
    const token = signAccessToken(user);
    const { request, result } = runAuthenticate(`Bearer ${token}`);

    expect(result).toBeUndefined();
    expect(request.user).toEqual({
      userId: user._id,
      role: user.role,
      adminLevel: user.adminLevel,
      branchId: user.branchId,
    });
    expect(request).not.toHaveProperty("auth");
    expect(JSON.stringify(request.user)).not.toContain(token);
  });

  it.each([undefined, "", "Basic abc", "Bearer", "Bearer ", "Bearer one two"])(
    "rejects missing or malformed Authorization header %s",
    (authorization) => {
      const { request, result } = runAuthenticate(authorization);

      expect(result).toMatchObject({ statusCode: 401, message: "Authentication required" });
      expect(request).not.toHaveProperty("user");
    },
  );

  it("rejects invalid, expired, and refresh tokens used as Bearer", () => {
    const refreshToken = createRefreshToken({
      userId: user._id,
      sessionId: "session-1",
      familyId: "family-1",
    });

    const expiredToken = jwt.sign(
      { ...user, userId: user._id, type: "access" },
      env.jwtAccessSecret,
      { algorithm: "HS256", expiresIn: -1 },
    );

    for (const token of ["not-a-jwt", `${signAccessToken(user)}x`, expiredToken, refreshToken]) {
      const { request, result } = runAuthenticate(`Bearer ${token}`);
      expect(result).toMatchObject({
        statusCode: 401,
        message: "Invalid or expired access token",
      });
      expect(request).not.toHaveProperty("user");
    }
  });
});

describe("authorizeRoles", () => {
  it("preserves allowed and denied role behavior", () => {
    const allowedNext = vi.fn();
    authorizeRoles("administrator")({ user: { role: "administrator" } }, {}, allowedNext);
    expect(allowedNext).toHaveBeenCalledWith();

    const deniedNext = vi.fn();
    authorizeRoles("administrator")({ user: { role: "customer" } }, {}, deniedNext);
    expect(deniedNext.mock.calls[0][0]).toMatchObject({
      statusCode: 403,
      message: "Insufficient permission",
    });
  });
});
