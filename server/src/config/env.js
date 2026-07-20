import dotenv from "dotenv";

dotenv.config();

const nodeEnv = process.env.NODE_ENV ?? "development";

function readPositiveInteger(name, fallback) {
  const rawValue = process.env[name] ?? fallback;
  const value = Number(rawValue);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

const requiredInProduction = [
  "MONGODB_URI",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "CLIENT_URL",
];

if (nodeEnv === "production") {
  const missing = requiredInProduction.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing production environment variables: ${missing.join(", ")}`);
  }
}

const otpHashSecret = process.env.OTP_HASH_SECRET?.trim();

if (!otpHashSecret && nodeEnv !== "test") {
  throw new Error("OTP_HASH_SECRET is required outside the test environment");
}

export const env = Object.freeze({
  nodeEnv,
  port: Number(process.env.PORT ?? 8080),
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
  mongoUri:
    process.env.MONGODB_URI ??
    "mongodb://localhost:27017/eyewear_shop_management?replicaSet=rs0",
  mongoTestUri:
    process.env.MONGODB_TEST_URI ??
    (nodeEnv === "test"
      ? "mongodb://localhost:27017/eyewear_shop_management_test?replicaSet=rs0"
      : undefined),
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? "development-access-secret",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? "development-refresh-secret",
  emailMode: process.env.EMAIL_MODE ?? "console",
  otpHashSecret: otpHashSecret ?? "test-only-otp-hash-secret",
  otpExpiresMinutes: readPositiveInteger("OTP_EXPIRES_MINUTES", 5),
  otpResendCooldownSeconds: readPositiveInteger("OTP_RESEND_COOLDOWN_SECONDS", 60),
});
