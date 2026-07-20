import { describe, expect, it } from "vitest";
import {
  resendVerificationOtpSchema,
  verifyEmailSchema,
} from "../src/validations/auth.validation.js";

describe("authentication validation", () => {
  it("accepts and normalizes valid verify-email input", () => {
    const { error, value } = verifyEmailSchema.validate({
      email: "  BAO@EXAMPLE.COM ",
      otp: "004821",
    });

    expect(error).toBeUndefined();
    expect(value).toEqual({ email: "bao@example.com", otp: "004821" });
  });

  it.each(["12345", "1234567", "12345a", 123456])(
    "rejects a non-six-digit string OTP",
    (otp) => {
      const { error } = verifyEmailSchema.validate({ email: "bao@example.com", otp });
      expect(error).toBeDefined();
    },
  );

  it("normalizes resend email", () => {
    const { error, value } = resendVerificationOtpSchema.validate({
      email: "  BAO@EXAMPLE.COM ",
    });

    expect(error).toBeUndefined();
    expect(value.email).toBe("bao@example.com");
  });
});
