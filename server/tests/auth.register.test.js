import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/services/email.service.js", () => ({
  sendVerificationOtp: vi.fn(),
}));

const { app } = await import("../src/app.js");
const { env } = await import("../src/config/env.js");
const { OtpToken } = await import("../src/models/OtpToken.js");
const { User } = await import("../src/models/User.js");
const { sendVerificationOtp } = await import("../src/services/email.service.js");
const {
  clearTestCollections,
  connectTestDatabase,
  disconnectTestDatabase,
} = await import("./helpers/database.js");

const validRegistration = {
  fullName: "Le Van Bao",
  email: "bao@example.com",
  password: "Password123",
};

async function register(overrides = {}) {
  return request(app)
    .post("/api/v1/auth/register")
    .send({ ...validRegistration, ...overrides });
}

beforeAll(async () => {
  await connectTestDatabase();
  await Promise.all([User.init(), OtpToken.init()]);
});

beforeEach(async () => {
  await clearTestCollections([OtpToken, User]);
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.mocked(sendVerificationOtp).mockResolvedValue(undefined);
});

afterAll(async () => {
  await clearTestCollections([OtpToken, User]);
  await disconnectTestDatabase();
});

describe("POST /api/v1/auth/register", () => {
  it("registers a pending customer and returns HTTP 201", async () => {
    const response = await register();

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      success: true,
      message: "Registration successful. Please verify your email.",
      data: { email: "bao@example.com", status: "pending_activation" },
    });
  });

  it("normalizes email to lowercase", async () => {
    const response = await register({ email: "  BAO@EXAMPLE.COM " });
    const user = await User.findOne({ email: "bao@example.com" });

    expect(response.status).toBe(201);
    expect(response.body.data.email).toBe("bao@example.com");
    expect(user).not.toBeNull();
  });

  it("creates role customer only", async () => {
    await register({ role: "administrator" });
    const user = await User.findOne({ email: validRegistration.email });

    expect(user.role).toBe("customer");
  });

  it("sets adminLevel and branchId to null", async () => {
    await register({
      adminLevel: "super_admin",
      branchId: "507f1f77bcf86cd799439011",
    });
    const user = await User.findOne({ email: validRegistration.email });

    expect(user.adminLevel).toBeNull();
    expect(user.branchId).toBeNull();
  });

  it("hashes password with bcrypt cost factor 12", async () => {
    await register();
    const user = await User.findOne({ email: validRegistration.email }).select("+passwordHash");

    expect(user.passwordHash).not.toBe(validRegistration.password);
    expect(bcrypt.getRounds(user.passwordHash)).toBe(12);
    await expect(bcrypt.compare(validRegistration.password, user.passwordHash)).resolves.toBe(true);
  });

  it("does not expose passwordHash", async () => {
    const response = await register();

    expect(response.body.data).not.toHaveProperty("password");
    expect(response.body.data).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(response.body)).not.toContain("Password123");
  });

  it("creates exactly one active email verification OTP", async () => {
    await register();
    const user = await User.findOne({ email: validRegistration.email });
    const tokens = await OtpToken.find({ userId: user._id, isActive: true });

    expect(tokens).toHaveLength(1);
    expect(tokens[0].purpose).toBe("email_verification");
    expect(tokens[0].usedAt).toBeNull();
    expect(tokens[0].invalidatedAt).toBeNull();
  });

  it("stores tokenHash rather than plain OTP", async () => {
    await register();
    const deliveredOtp = vi.mocked(sendVerificationOtp).mock.calls[0][0].otp;
    const token = await OtpToken.findOne().select("+tokenHash");

    expect(deliveredOtp).toMatch(/^\d{6}$/);
    expect(token.tokenHash).toMatch(/^[a-f\d]{64}$/);
    expect(token.tokenHash).not.toBe(deliveredOtp);
  });

  it("sets OTP expiry from configuration", async () => {
    const startedAt = Date.now();
    await register();
    const finishedAt = Date.now();
    const token = await OtpToken.findOne();
    const expectedLifetime = env.otpExpiresMinutes * 60_000;

    expect(token.expiresAt.getTime()).toBeGreaterThanOrEqual(startedAt + expectedLifetime);
    expect(token.expiresAt.getTime()).toBeLessThanOrEqual(finishedAt + expectedLifetime);
  });

  it("invokes the console email delivery service", async () => {
    await register();

    expect(sendVerificationOtp).toHaveBeenCalledTimes(1);
    expect(sendVerificationOtp).toHaveBeenCalledWith({
      email: "bao@example.com",
      otp: expect.stringMatching(/^\d{6}$/),
      purpose: "email_verification",
      expiresMinutes: env.otpExpiresMinutes,
    });
  });

  it("does not return OTP or tokenHash", async () => {
    const response = await register();
    const deliveredOtp = vi.mocked(sendVerificationOtp).mock.calls[0][0].otp;
    const serializedResponse = JSON.stringify(response.body);

    expect(response.body.data).not.toHaveProperty("otp");
    expect(response.body.data).not.toHaveProperty("tokenHash");
    expect(serializedResponse).not.toContain(deliveredOtp);
  });

  it("rejects invalid fullName", async () => {
    const response = await register({ fullName: "L" });

    expect(response.status).toBe(400);
    expect(await User.countDocuments()).toBe(0);
  });

  it("rejects invalid email", async () => {
    const response = await register({ email: "not-an-email" });

    expect(response.status).toBe(400);
    expect(await User.countDocuments()).toBe(0);
  });

  it("rejects weak password", async () => {
    const response = await register({ password: "password" });

    expect(response.status).toBe(400);
    expect(await User.countDocuments()).toBe(0);
  });

  it("prevents injected role, adminLevel, status, and verification fields", async () => {
    await register({
      role: "administrator",
      adminLevel: "super_admin",
      status: "active",
      emailVerifiedAt: new Date().toISOString(),
      failedLoginAttempts: 99,
    });
    const user = await User.findOne({ email: validRegistration.email });

    expect(user.role).toBe("customer");
    expect(user.adminLevel).toBeNull();
    expect(user.status).toBe("pending_activation");
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.failedLoginAttempts).toBe(0);
  });

  it("rejects duplicate email with HTTP 409", async () => {
    expect((await register()).status).toBe(201);
    const duplicateResponse = await register();

    expect(duplicateResponse.status).toBe(409);
    expect(duplicateResponse.body.message).toBe("Email already exists");
    expect(await User.countDocuments()).toBe(1);
    expect(await OtpToken.countDocuments()).toBe(1);
  });

  it("handles concurrent registration for the same email", async () => {
    const responses = await Promise.all([register(), register()]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(await User.countDocuments({ email: validRegistration.email })).toBe(1);
    expect(await OtpToken.countDocuments({ isActive: true })).toBe(1);
  });

  it("rolls back User creation if OtpToken creation fails", async () => {
    vi.spyOn(OtpToken, "create").mockRejectedValueOnce(new Error("forced token failure"));

    const response = await register();

    expect(response.status).toBe(500);
    expect(await User.countDocuments()).toBe(0);
    expect(await OtpToken.countDocuments()).toBe(0);
  });

  it("keeps the committed account when OTP delivery fails", async () => {
    vi.mocked(sendVerificationOtp).mockRejectedValueOnce(new Error("provider unavailable"));

    const response = await register();

    expect(response.status).toBe(503);
    expect(response.body.message).toContain("Account created");
    expect(await User.countDocuments()).toBe(1);
    expect(await OtpToken.countDocuments()).toBe(1);
  });

  it("does not issue Access Token", async () => {
    const response = await register();
    const serializedResponse = JSON.stringify(response.body).toLowerCase();

    expect(serializedResponse).not.toContain("accesstoken");
    expect(serializedResponse).not.toContain("access_token");
  });

  it("does not create a refresh cookie", async () => {
    const response = await register();

    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(JSON.stringify(response.body).toLowerCase()).not.toContain("refresh");
  });

  it("applies the global rate limit per client IP", async () => {
    const exhaustedIp = "203.0.113.173";
    const independentIp = "203.0.113.174";
    const invalidRegistration = {};
    const sendInvalidRegistration = (ipAddress) =>
      request(app)
        .post("/api/v1/auth/register")
        .set("X-Forwarded-For", ipAddress)
        .send(invalidRegistration);

    const firstResponse = await sendInvalidRegistration(exhaustedIp);

    expect(firstResponse.status).toBe(400);
    expect(firstResponse.status).not.toBe(429);

    const remainingAllowedResponses = await Promise.all(
      Array.from({ length: 299 }, () => sendInvalidRegistration(exhaustedIp)),
    );

    expect(remainingAllowedResponses.every(({ status }) => status !== 429)).toBe(true);

    const limitedResponse = await sendInvalidRegistration(exhaustedIp);
    const retryAfterHeader = Object.keys(limitedResponse.headers).find(
      (headerName) => headerName.toLowerCase() === "retry-after",
    );
    const rateLimitHeader = Object.keys(limitedResponse.headers).find(
      (headerName) => headerName.toLowerCase() === "ratelimit",
    );

    expect(limitedResponse.status).toBe(429);
    expect(retryAfterHeader).toBeDefined();
    expect(Number(limitedResponse.headers[retryAfterHeader])).toBeGreaterThan(0);
    expect(rateLimitHeader).toBeDefined();
    expect(limitedResponse.headers[rateLimitHeader]).toBeTruthy();

    const independentResponse = await sendInvalidRegistration(independentIp);

    expect(independentResponse.status).toBe(400);
    expect(independentResponse.status).not.toBe(429);
  }, 15_000);
});
