import { env } from "../config/env.js";

const EMAIL_VERIFICATION_PURPOSE = "email_verification";

export async function sendVerificationOtp({
  email,
  otp,
  purpose,
  expiresMinutes = env.otpExpiresMinutes,
} = {}) {
  if (!email || !otp || !purpose) {
    throw new TypeError("email, otp, and purpose are required to send a verification OTP");
  }

  if (purpose !== EMAIL_VERIFICATION_PURPOSE) {
    throw new TypeError(`Unsupported OTP purpose: ${purpose}`);
  }

  if (env.emailMode !== "console") {
    throw new Error(`Unsupported EMAIL_MODE: ${env.emailMode}`);
  }

  if (env.nodeEnv === "production") {
    throw new Error("EMAIL_MODE=console is not allowed in production");
  }

  console.log(
    `[Development email] email=${email} purpose=${purpose} otp=${otp} expiresInMinutes=${expiresMinutes}`,
  );
}
