import dotenv from "dotenv";

dotenv.config();

const nodeEnv = process.env.NODE_ENV ?? "development";

function readRequiredSecret(name) {
  const value = process.env[name]?.trim();

  if (value) {
    return value;
  }

  if (nodeEnv === "test") {
    return `test-only-${name.toLowerCase().replaceAll("_", "-")}`;
  }

  throw new Error(`${name} is required outside the test environment`);
}

function readPositiveInteger(name, fallback) {
  const rawValue = process.env[name] ?? fallback;
  const value = Number(rawValue);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

function readNonEmptyString(name, fallback) {
  const value = (process.env[name] ?? fallback)?.trim();

  if (!value) {
    throw new Error(`${name} must be a non-empty string`);
  }

  return value;
}

function readDurationString(name, fallback) {
  const value = readNonEmptyString(name, fallback);
  const match = value.match(/^(\d+)([smhd])$/);

  if (!match || Number(match[1]) <= 0) {
    throw new Error(`${name} must be a positive duration using s, m, h, or d`);
  }

  return value;
}

function readSafeCookieName() {
  const value = readNonEmptyString("REFRESH_COOKIE_NAME", "esms_refresh_token");

  if (!/^[!#$%&'*+.^_`|~\dA-Za-z-]+$/.test(value)) {
    throw new Error("REFRESH_COOKIE_NAME must be a safe cookie name");
  }

  return value;
}

const requiredInProduction = ["MONGODB_URI", "CLIENT_URL"];

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
  jwtAccessSecret: readRequiredSecret("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: readRequiredSecret("JWT_REFRESH_SECRET"),
  jwtAccessExpiresIn: readDurationString("JWT_ACCESS_EXPIRES_IN", "15m"),
  jwtRefreshExpiresIn: readDurationString("JWT_REFRESH_EXPIRES_IN", "7d"),
  accountLockMinutes: readPositiveInteger("ACCOUNT_LOCK_MINUTES", 15),
  maxActiveRefreshSessions: readPositiveInteger("MAX_ACTIVE_REFRESH_SESSIONS", 10),
  refreshCookieName: readSafeCookieName(),
  emailMode: process.env.EMAIL_MODE ?? "console",
  otpHashSecret: otpHashSecret ?? "test-only-otp-hash-secret",
  otpExpiresMinutes: readPositiveInteger("OTP_EXPIRES_MINUTES", 5),
  otpResendCooldownSeconds: readPositiveInteger("OTP_RESEND_COOLDOWN_SECONDS", 60),
});
