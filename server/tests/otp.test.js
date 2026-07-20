import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { OtpToken } from "../src/models/OtpToken.js";
import { generateOtp, hashOtp, verifyOtpHash } from "../src/utils/otp.js";

const userId = new mongoose.Types.ObjectId().toString();
const purpose = "email_verification";

describe("OTP utility", () => {
  it("always returns exactly six digits", () => {
    expect(generateOtp()).toMatch(/^\d{6}$/);
  });

  it("preserves possible leading zero formatting", () => {
    expect(generateOtp(() => 4821)).toBe("004821");
  });

  it("returns valid values across repeated generation", () => {
    for (let iteration = 0; iteration < 100; iteration += 1) {
      expect(generateOtp()).toMatch(/^\d{6}$/);
    }
  });

  it("creates a deterministic HMAC that is not the plain OTP", () => {
    const firstHash = hashOtp({ otp: "123456", userId, purpose });
    const secondHash = hashOtp({ otp: "123456", userId, purpose });

    expect(firstHash).not.toBe("123456");
    expect(firstHash).toBe(secondHash);
  });

  it.each([
    { otp: "654321", userId, purpose },
    { otp: "123456", userId: new mongoose.Types.ObjectId().toString(), purpose },
    { otp: "123456", userId, purpose: "different_purpose" },
  ])("changes the hash when an input changes", (changedInput) => {
    const originalHash = hashOtp({ otp: "123456", userId, purpose });
    expect(hashOtp(changedInput)).not.toBe(originalHash);
  });

  it("accepts the correct OTP", () => {
    const tokenHash = hashOtp({ otp: "123456", userId, purpose });
    expect(verifyOtpHash({ otp: "123456", userId, purpose, tokenHash })).toBe(true);
  });

  it("rejects the wrong OTP", () => {
    const tokenHash = hashOtp({ otp: "123456", userId, purpose });
    expect(verifyOtpHash({ otp: "654321", userId, purpose, tokenHash })).toBe(false);
  });

  it.each([undefined, null, "", "not-a-hash", "a".repeat(62)])(
    "handles malformed stored hashes safely",
    (tokenHash) => {
      expect(() =>
        verifyOtpHash({ otp: "123456", userId, purpose, tokenHash }),
      ).not.toThrow();
      expect(verifyOtpHash({ otp: "123456", userId, purpose, tokenHash })).toBe(false);
    },
  );
});

describe("OtpToken model", () => {
  it("excludes tokenHash from queries by default", () => {
    expect(OtpToken.schema.path("tokenHash").options.select).toBe(false);
  });

  it("exposes the approved indexes", () => {
    const indexes = OtpToken.schema.indexes();

    expect(indexes).toContainEqual([{ expiresAt: 1 }, { expireAfterSeconds: 0 }]);
    expect(indexes).toContainEqual([{ userId: 1, purpose: 1, createdAt: -1 }, {}]);
    expect(indexes).toContainEqual([
      { userId: 1, purpose: 1 },
      { unique: true, partialFilterExpression: { isActive: true } },
    ]);
  });
});
