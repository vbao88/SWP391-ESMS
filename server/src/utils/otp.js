import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

const OTP_PATTERN = /^\d{6}$/;
const SHA256_HEX_PATTERN = /^[a-f\d]{64}$/i;

function requireString(value, name) {
  const stringValue = value?.toString();

  if (!stringValue) {
    throw new TypeError(`${name} is required`);
  }

  return stringValue;
}

function buildOtpHashInput({ otp, userId, purpose }) {
  const normalizedOtp = requireString(otp, "otp");

  if (!OTP_PATTERN.test(normalizedOtp)) {
    throw new TypeError("otp must contain exactly six digits");
  }

  return `${requireString(userId, "userId")}:${requireString(purpose, "purpose")}:${normalizedOtp}`;
}

export function generateOtp(randomIntFunction = randomInt) {
  if (typeof randomIntFunction !== "function") {
    throw new TypeError("randomIntFunction must be a function");
  }

  return randomIntFunction(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtp({ otp, userId, purpose } = {}) {
  const input = buildOtpHashInput({ otp, userId, purpose });
  return createHmac("sha256", env.otpHashSecret).update(input).digest("hex");
}

export function verifyOtpHash({ otp, userId, purpose, tokenHash } = {}) {
  if (typeof tokenHash !== "string" || !SHA256_HEX_PATTERN.test(tokenHash)) {
    return false;
  }

  const candidateHash = hashOtp({ otp, userId, purpose });
  const candidateBuffer = Buffer.from(candidateHash, "hex");
  const storedBuffer = Buffer.from(tokenHash, "hex");

  return candidateBuffer.length === storedBuffer.length && timingSafeEqual(candidateBuffer, storedBuffer);
}
