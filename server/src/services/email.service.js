import { env } from "../config/env.js";

const EMAIL_VERIFICATION_PURPOSE = "email_verification";

export async function sendVerificationOtp({
  email,
  otp,
  expiresMinutes = env.otpExpiresMinutes,
} = {}) {
  if (!email || !otp) {
    throw new TypeError("email and otp are required to send a verification OTP");
  }

  if (env.emailMode !== "console") {
    throw new Error(`Unsupported EMAIL_MODE: ${env.emailMode}`);
  }

  if (env.nodeEnv === "production") {
    throw new Error("EMAIL_MODE=console is not allowed in production");
  }

  console.log(
    `[Development email] email=${email} purpose=${EMAIL_VERIFICATION_PURPOSE} otp=${otp} expiresInMinutes=${expiresMinutes}`,
  );
}
