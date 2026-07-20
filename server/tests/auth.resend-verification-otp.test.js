import mongoose from "mongoose";
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
const { hashOtp } = await import("../src/utils/otp.js");
const {
  clearTestCollections,
  connectTestDatabase,
  disconnectTestDatabase,
} = await import("./helpers/database.js");

const EMAIL = "bao@example.com";
const OLD_OTP = "111111";
const PURPOSE = "email_verification";
const COOLDOWN_ELAPSED_AT = () =>
  new Date(Date.now() - (env.otpResendCooldownSeconds + 5) * 1_000);

async function createUser({
  email = EMAIL,
  status = "pending_activation",
  emailVerifiedAt = null,
  role = "customer",
  adminLevel = null,
  branchId = null,
  passwordHash = "fixture-password-hash",
  fullName = "Le Van Bao",
} = {}) {
  return User.create({
    fullName,
    email,
    passwordHash,
    role,
    adminLevel,
    branchId,
    status,
    emailVerifiedAt,
    failedLoginAttempts: 0,
    lockedUntil: null,
  });
}

async function createToken(
  user,
  {
    otp = OLD_OTP,
    createdAt = COOLDOWN_ELAPSED_AT(),
    expiresAt = new Date(Date.now() + 5 * 60_000),
    isActive = true,
    usedAt = null,
    invalidatedAt = null,
  } = {},
) {
  return OtpToken.create({
    userId: user._id,
    purpose: PURPOSE,
    tokenHash: hashOtp({ otp, userId: user._id, purpose: PURPOSE }),
    expiresAt,
    isActive,
    usedAt,
    invalidatedAt,
    createdAt,
    updatedAt: createdAt,
  });
}

async function createEligibleFixture(tokenOptions = {}) {
  const user = await createUser();
  const token = await createToken(user, tokenOptions);
  return { user, token };
}

function resend(email = EMAIL) {
  return request(app).post("/api/v1/auth/resend-verification-otp").send({ email });
}

function verify(otp, email = EMAIL) {
  return request(app).post("/api/v1/auth/verify-email").send({ email, otp });
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

describe("POST /api/v1/auth/resend-verification-otp", () => {
  it("resends an OTP after cooldown", async () => {
    await createEligibleFixture();
    expect((await resend()).status).toBe(200);
  });

  it("returns HTTP 200 with only safe email data", async () => {
    await createEligibleFixture();
    const response = await resend();

    expect(response.body).toEqual({
      success: true,
      message: "A new verification OTP has been generated.",
      data: { email: EMAIL },
    });
  });

  it("normalizes email before lookup", async () => {
    await createEligibleFixture();
    const response = await resend("  BAO@EXAMPLE.COM ");

    expect(response.status).toBe(200);
    expect(response.body.data.email).toBe(EMAIL);
  });

  it("generates a new six-digit OTP", async () => {
    await createEligibleFixture();
    await resend();
    const deliveredOtp = vi.mocked(sendVerificationOtp).mock.calls[0][0].otp;

    expect(deliveredOtp).toMatch(/^\d{6}$/);
  });

  it("stores only tokenHash", async () => {
    await createEligibleFixture();
    await resend();
    const deliveredOtp = vi.mocked(sendVerificationOtp).mock.calls[0][0].otp;
    const newestToken = await OtpToken.findOne().sort({ createdAt: -1 }).select("+tokenHash");

    expect(newestToken.tokenHash).toMatch(/^[a-f\d]{64}$/);
    expect(newestToken.tokenHash).not.toBe(deliveredOtp);
    expect(newestToken.toObject()).not.toHaveProperty("otp");
  });

  it("sets expiry using OTP configuration", async () => {
    await createEligibleFixture();
    const startedAt = Date.now();
    await resend();
    const finishedAt = Date.now();
    const newestToken = await OtpToken.findOne().sort({ createdAt: -1 });
    const lifetime = env.otpExpiresMinutes * 60_000;

    expect(newestToken.expiresAt.getTime()).toBeGreaterThanOrEqual(startedAt + lifetime);
    expect(newestToken.expiresAt.getTime()).toBeLessThanOrEqual(finishedAt + lifetime);
  });

  it("creates exactly one active OTP", async () => {
    const { user } = await createEligibleFixture();
    await resend();

    expect(await OtpToken.countDocuments({ userId: user._id, isActive: true })).toBe(1);
  });

  it("invalidates the previous active OTP", async () => {
    const { token } = await createEligibleFixture();
    await resend();
    const previousToken = await OtpToken.findById(token._id);

    expect(previousToken.isActive).toBe(false);
  });

  it("sets invalidatedAt on the previous OTP", async () => {
    const { token } = await createEligibleFixture();
    await resend();
    const previousToken = await OtpToken.findById(token._id);

    expect(previousToken.invalidatedAt).toBeInstanceOf(Date);
  });

  it("does not set usedAt when invalidating due to resend", async () => {
    const { token } = await createEligibleFixture();
    await resend();
    const previousToken = await OtpToken.findById(token._id);

    expect(previousToken.usedAt).toBeNull();
  });

  it("rejects the previous OTP after resend", async () => {
    await createEligibleFixture();
    await resend();

    expect((await verify(OLD_OTP)).status).toBe(400);
  });

  it("allows verification with the newly generated OTP", async () => {
    await createEligibleFixture();
    await resend();
    const newOtp = vi.mocked(sendVerificationOtp).mock.calls[0][0].otp;

    expect((await verify(newOtp)).status).toBe(200);
  });

  it("rejects resend within the cooldown using HTTP 429", async () => {
    await createEligibleFixture({ createdAt: new Date() });
    const response = await resend();

    expect(response.status).toBe(429);
    expect(response.body.message).toBe("Please wait before requesting another OTP.");
    expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("cooldown failure does not invalidate the current OTP", async () => {
    const { token } = await createEligibleFixture({ createdAt: new Date() });
    await resend();
    const unchangedToken = await OtpToken.findById(token._id);

    expect(unchangedToken.isActive).toBe(true);
    expect(unchangedToken.invalidatedAt).toBeNull();
  });

  it("cooldown failure does not create another token", async () => {
    await createEligibleFixture({ createdAt: new Date() });
    await resend();

    expect(await OtpToken.countDocuments()).toBe(1);
  });

  it("cooldown failure does not invoke email delivery", async () => {
    await createEligibleFixture({ createdAt: new Date() });
    await resend();

    expect(sendVerificationOtp).not.toHaveBeenCalled();
  });

  it("allows resend when the previous token is expired but cooldown elapsed", async () => {
    await createEligibleFixture({ expiresAt: new Date(Date.now() - 1_000) });

    expect((await resend()).status).toBe(200);
  });

  it("allows resend when the previous token is used but account remains pending", async () => {
    await createEligibleFixture({ usedAt: new Date(), isActive: false });

    expect((await resend()).status).toBe(200);
  });

  it("allows resend when the previous token is invalidated and cooldown elapsed", async () => {
    await createEligibleFixture({ invalidatedAt: new Date(), isActive: false });

    expect((await resend()).status).toBe(200);
  });

  it("rejects missing account with HTTP 404", async () => {
    expect((await resend()).status).toBe(404);
  });

  it("rejects verified account with HTTP 409", async () => {
    const user = await createUser({ emailVerifiedAt: new Date() });
    await createToken(user);

    expect((await resend()).status).toBe(409);
  });

  it("rejects active account with HTTP 409", async () => {
    const user = await createUser({ status: "active" });
    await createToken(user);

    expect((await resend()).status).toBe(409);
  });

  it.each(["inactive", "locked"])(
    "rejects inactive or locked account with HTTP 409",
    async (status) => {
      const user = await createUser({ status });
      await createToken(user);

      expect((await resend()).status).toBe(409);
    },
  );

  it("does not modify role, adminLevel, branchId, passwordHash, or profile fields", async () => {
    const branchId = new mongoose.Types.ObjectId();
    const user = await createUser({ branchId, fullName: "Original Customer" });
    await createToken(user);
    await resend();
    const unchangedUser = await User.findById(user._id).select("+passwordHash");

    expect(unchangedUser.role).toBe("customer");
    expect(unchangedUser.adminLevel).toBeNull();
    expect(unchangedUser.branchId.toString()).toBe(branchId.toString());
    expect(unchangedUser.passwordHash).toBe("fixture-password-hash");
    expect(unchangedUser.fullName).toBe("Original Customer");
  });

  it("invokes email delivery only after transaction commit", async () => {
    const { token } = await createEligibleFixture();
    vi.mocked(sendVerificationOtp).mockImplementationOnce(async () => {
      const previousToken = await OtpToken.findById(token._id);
      const activeTokens = await OtpToken.countDocuments({ isActive: true });
      expect(previousToken.invalidatedAt).toBeInstanceOf(Date);
      expect(activeTokens).toBe(1);
    });

    expect((await resend()).status).toBe(200);
    expect(sendVerificationOtp).toHaveBeenCalledTimes(1);
  });

  it("keeps the new OTP stored when email delivery fails", async () => {
    await createEligibleFixture();
    vi.mocked(sendVerificationOtp).mockRejectedValueOnce(new Error("provider unavailable"));
    await resend();

    expect(await OtpToken.countDocuments({ isActive: true })).toBe(1);
  });

  it("returns controlled HTTP 503 when email delivery fails", async () => {
    await createEligibleFixture();
    vi.mocked(sendVerificationOtp).mockRejectedValueOnce(new Error("provider unavailable"));
    const response = await resend();

    expect(response.status).toBe(503);
    expect(response.body.message).toContain("could not be delivered");
    expect(JSON.stringify(response.body)).not.toContain("provider unavailable");
  });

  it("does not expose OTP or tokenHash in response", async () => {
    await createEligibleFixture();
    const response = await resend();
    const otp = vi.mocked(sendVerificationOtp).mock.calls[0][0].otp;
    const token = await OtpToken.findOne().sort({ createdAt: -1 }).select("+tokenHash");
    const body = JSON.stringify(response.body);

    expect(body).not.toContain(otp);
    expect(body).not.toContain(token.tokenHash);
  });

  it("does not issue an Access Token", async () => {
    await createEligibleFixture();
    const body = JSON.stringify((await resend()).body).toLowerCase();

    expect(body).not.toContain("accesstoken");
    expect(body).not.toContain("access_token");
  });

  it("does not create a refresh cookie", async () => {
    await createEligibleFixture();
    const response = await resend();

    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(JSON.stringify(response.body).toLowerCase()).not.toContain("refresh");
  });

  it("two concurrent resend requests leave exactly one active OTP", async () => {
    await createEligibleFixture();
    await Promise.all([resend(), resend()]);

    expect(await OtpToken.countDocuments({ isActive: true })).toBe(1);
  });

  it("two concurrent resend requests produce exactly one HTTP 200", async () => {
    await createEligibleFixture();
    const responses = await Promise.all([resend(), resend()]);

    expect(responses.filter(({ status }) => status === 200)).toHaveLength(1);
  });

  it("concurrent loser receives HTTP 429 or controlled conflict", async () => {
    await createEligibleFixture();
    const responses = await Promise.all([resend(), resend()]);
    const loser = responses.find(({ status }) => status !== 200);

    expect([409, 429]).toContain(loser.status);
  });

  it("does not return raw MongoDB error details", async () => {
    await createEligibleFixture();
    const responses = await Promise.all([resend(), resend()]);
    const loserBody = responses.find(({ status }) => status !== 200).body;
    const body = JSON.stringify(loserBody);

    expect(body).not.toContain("11000");
    expect(body).not.toContain("MongoServerError");
  });

  it("register endpoint still works", async () => {
    const response = await request(app).post("/api/v1/auth/register").send({
      fullName: "New Customer",
      email: "new@example.com",
      password: "Password123",
    });

    expect(response.status).toBe(201);
  });

  it("verify-email endpoint still works after resend", async () => {
    await createEligibleFixture();
    await resend();
    const newOtp = vi.mocked(sendVerificationOtp).mock.calls[0][0].otp;

    expect((await verify(newOtp)).status).toBe(200);
  });

  it("old OTP remains rejected even if it has not expired", async () => {
    await createEligibleFixture({ expiresAt: new Date(Date.now() + 10 * 60_000) });
    await resend();

    expect((await verify(OLD_OTP)).status).toBe(400);
  });

  it("new OTP can be consumed only once", async () => {
    await createEligibleFixture();
    await resend();
    const newOtp = vi.mocked(sendVerificationOtp).mock.calls[0][0].otp;

    expect((await verify(newOtp)).status).toBe(200);
    expect((await verify(newOtp)).status).toBe(409);
  });
});
