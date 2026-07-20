import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/services/email.service.js", () => ({
  sendVerificationOtp: vi.fn(),
}));

const { app } = await import("../src/app.js");
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
const VALID_OTP = "123456";
const PURPOSE = "email_verification";

async function createFixture({
  email = EMAIL,
  status = "pending_activation",
  emailVerifiedAt = null,
  role = "customer",
  adminLevel = null,
  branchId = null,
  otp = VALID_OTP,
  expiresAt = new Date(Date.now() + 5 * 60_000),
  usedAt = null,
  invalidatedAt = null,
  isActive = true,
  createdAt,
  createToken = true,
} = {}) {
  const user = await User.create({
    fullName: "Le Van Bao",
    email,
    passwordHash: "fixture-password-hash",
    role,
    adminLevel,
    branchId,
    status,
    emailVerifiedAt,
    failedLoginAttempts: 0,
    lockedUntil: null,
  });

  let token = null;
  if (createToken) {
    token = await OtpToken.create({
      userId: user._id,
      purpose: PURPOSE,
      tokenHash: hashOtp({ otp, userId: user._id, purpose: PURPOSE }),
      expiresAt,
      usedAt,
      invalidatedAt,
      isActive,
      ...(createdAt ? { createdAt, updatedAt: createdAt } : {}),
    });
  }

  return { user, token, otp };
}

function verifyEmail(payload = { email: EMAIL, otp: VALID_OTP }) {
  return request(app).post("/api/v1/auth/verify-email").send(payload);
}

beforeAll(async () => {
  await connectTestDatabase();
  await Promise.all([User.init(), OtpToken.init()]);
});

beforeEach(async () => {
  await clearTestCollections([OtpToken, User]);
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

afterAll(async () => {
  await clearTestCollections([OtpToken, User]);
  await disconnectTestDatabase();
});

describe("POST /api/v1/auth/verify-email", () => {
  it("verifies a pending account using the newest valid OTP", async () => {
    await createFixture();
    const response = await verifyEmail();

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("active");
  });

  it("returns HTTP 200 with only safe email and active status", async () => {
    await createFixture();
    const response = await verifyEmail();

    expect(response.body).toEqual({
      success: true,
      message: "Email verified successfully.",
      data: { email: EMAIL, status: "active" },
    });
  });

  it("sets emailVerifiedAt", async () => {
    await createFixture();
    const beforeVerification = Date.now();
    await verifyEmail();
    const user = await User.findOne({ email: EMAIL });

    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    expect(user.emailVerifiedAt.getTime()).toBeGreaterThanOrEqual(beforeVerification);
  });

  it("changes status from pending_activation to active", async () => {
    await createFixture();
    await verifyEmail();
    const user = await User.findOne({ email: EMAIL });

    expect(user.status).toBe("active");
  });

  it("sets token usedAt", async () => {
    const { token } = await createFixture();
    await verifyEmail();
    const consumedToken = await OtpToken.findById(token._id);

    expect(consumedToken.usedAt).toBeInstanceOf(Date);
  });

  it("sets token isActive to false", async () => {
    const { token } = await createFixture();
    await verifyEmail();
    const consumedToken = await OtpToken.findById(token._id);

    expect(consumedToken.isActive).toBe(false);
  });

  it("does not expose tokenHash", async () => {
    const { token } = await createFixture();
    const storedToken = await OtpToken.findById(token._id).select("+tokenHash");
    const response = await verifyEmail();

    expect(response.body.data).not.toHaveProperty("tokenHash");
    expect(JSON.stringify(response.body)).not.toContain(storedToken.tokenHash);
  });

  it("does not expose passwordHash", async () => {
    await createFixture();
    const response = await verifyEmail();

    expect(response.body.data).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(response.body)).not.toContain("fixture-password-hash");
  });

  it("does not issue Access Token", async () => {
    await createFixture();
    const response = await verifyEmail();
    const body = JSON.stringify(response.body).toLowerCase();

    expect(body).not.toContain("accesstoken");
    expect(body).not.toContain("access_token");
  });

  it("does not create refresh cookie", async () => {
    await createFixture();
    const response = await verifyEmail();

    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(JSON.stringify(response.body).toLowerCase()).not.toContain("refresh");
  });

  it("normalizes email before lookup", async () => {
    await createFixture();
    const response = await verifyEmail({ email: "  BAO@EXAMPLE.COM ", otp: VALID_OTP });

    expect(response.status).toBe(200);
    expect(response.body.data.email).toBe(EMAIL);
  });

  it("rejects malformed OTP through Joi with HTTP 400", async () => {
    await createFixture();
    const response = await verifyEmail({ email: EMAIL, otp: "12345a" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation failed");
  });

  it("rejects incorrect OTP and leaves token usable", async () => {
    const { token } = await createFixture();
    const response = await verifyEmail({ email: EMAIL, otp: "654321" });
    const unchangedToken = await OtpToken.findById(token._id);
    const unchangedUser = await User.findOne({ email: EMAIL });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("OTP is incorrect or expired.");
    expect(unchangedToken.isActive).toBe(true);
    expect(unchangedToken.usedAt).toBeNull();
    expect(unchangedUser.status).toBe("pending_activation");
  });

  it("rejects expired OTP", async () => {
    await createFixture({ expiresAt: new Date(Date.now() - 1_000) });
    const response = await verifyEmail();

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("OTP is incorrect or expired.");
  });

  it("expired OTP does not activate User", async () => {
    await createFixture({ expiresAt: new Date(Date.now() - 1_000) });
    await verifyEmail();
    const user = await User.findOne({ email: EMAIL });

    expect(user.status).toBe("pending_activation");
    expect(user.emailVerifiedAt).toBeNull();
  });

  it("expired OTP is deactivated", async () => {
    const { token } = await createFixture({ expiresAt: new Date(Date.now() - 1_000) });
    await verifyEmail();
    const expiredToken = await OtpToken.findById(token._id);

    expect(expiredToken.isActive).toBe(false);
    expect(expiredToken.usedAt).toBeNull();
  });

  it("rejects used OTP", async () => {
    await createFixture({ usedAt: new Date(), isActive: false });
    const response = await verifyEmail();

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("OTP is incorrect or expired.");
  });

  it("rejects invalidated OTP", async () => {
    await createFixture({ invalidatedAt: new Date(), isActive: false });
    const response = await verifyEmail();

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("OTP is incorrect or expired.");
  });

  it("rejects missing account with HTTP 404", async () => {
    const response = await verifyEmail();

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Account does not exist");
  });

  it("rejects already verified account with HTTP 409", async () => {
    await createFixture({ emailVerifiedAt: new Date() });
    const response = await verifyEmail();

    expect(response.status).toBe(409);
  });

  it("rejects active account with HTTP 409", async () => {
    await createFixture({ status: "active" });
    const response = await verifyEmail();

    expect(response.status).toBe(409);
  });

  it.each(["inactive", "locked"])(
    "rejects an inactive or locked account with HTTP 409",
    async (status) => {
      await createFixture({ status });
      const response = await verifyEmail();

      expect(response.status).toBe(409);
    },
  );

  it("rejects an older OTP even if its value is correct", async () => {
    const { user } = await createFixture({
      otp: "111111",
      isActive: false,
      createdAt: new Date(Date.now() - 60_000),
    });
    await OtpToken.create({
      userId: user._id,
      purpose: PURPOSE,
      tokenHash: hashOtp({ otp: "222222", userId: user._id, purpose: PURPOSE }),
      expiresAt: new Date(Date.now() + 5 * 60_000),
      isActive: true,
    });

    const response = await verifyEmail({ email: EMAIL, otp: "111111" });

    expect(response.status).toBe(400);
    expect((await User.findById(user._id)).status).toBe("pending_activation");
  });

  it("accepts only the newest active OTP", async () => {
    const { user } = await createFixture({
      otp: "111111",
      isActive: false,
      createdAt: new Date(Date.now() - 60_000),
    });
    await OtpToken.create({
      userId: user._id,
      purpose: PURPOSE,
      tokenHash: hashOtp({ otp: "222222", userId: user._id, purpose: PURPOSE }),
      expiresAt: new Date(Date.now() + 5 * 60_000),
      isActive: true,
    });

    const response = await verifyEmail({ email: EMAIL, otp: "222222" });

    expect(response.status).toBe(200);
  });

  it("allows only one of two concurrent verify requests to succeed", async () => {
    await createFixture();
    const responses = await Promise.all([verifyEmail(), verifyEmail()]);

    expect(responses.filter(({ status }) => status === 200)).toHaveLength(1);
    expect(responses.filter(({ status }) => status === 400 || status === 409)).toHaveLength(1);
  });

  it("concurrent verify consumes token exactly once", async () => {
    const { token } = await createFixture();
    await Promise.all([verifyEmail(), verifyEmail()]);
    const consumedToken = await OtpToken.findById(token._id);
    const user = await User.findOne({ email: EMAIL });

    expect(consumedToken.isActive).toBe(false);
    expect(consumedToken.usedAt).toBeInstanceOf(Date);
    expect(user.status).toBe("active");
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it("rolls back token consumption when User conditional activation fails", async () => {
    const { token } = await createFixture();
    vi.spyOn(User, "updateOne").mockResolvedValueOnce({ modifiedCount: 0 });

    const response = await verifyEmail();
    const unchangedToken = await OtpToken.findById(token._id);
    const unchangedUser = await User.findOne({ email: EMAIL });

    expect(response.status).toBe(409);
    expect(unchangedToken.isActive).toBe(true);
    expect(unchangedToken.usedAt).toBeNull();
    expect(unchangedUser.status).toBe("pending_activation");
  });

  it("does not change role, adminLevel, or branchId", async () => {
    const branchId = new mongoose.Types.ObjectId();
    await createFixture({ branchId });
    await verifyEmail();
    const user = await User.findOne({ email: EMAIL });

    expect(user.role).toBe("customer");
    expect(user.adminLevel).toBeNull();
    expect(user.branchId.toString()).toBe(branchId.toString());
  });

  it("verification does not invoke email delivery", async () => {
    await createFixture();
    await verifyEmail();

    expect(sendVerificationOtp).not.toHaveBeenCalled();
  });

  it("repeated verification after success is rejected", async () => {
    await createFixture();
    expect((await verifyEmail()).status).toBe(200);

    const repeatedResponse = await verifyEmail();
    expect(repeatedResponse.status).toBe(409);
  });
});
