import dotenv from "dotenv";

dotenv.config();

const requiredInProduction = [
  "MONGODB_URI",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "CLIENT_URL",
];

if (process.env.NODE_ENV === "production") {
  const missing = requiredInProduction.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing production environment variables: ${missing.join(", ")}`);
  }
}

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 8080),
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
  mongoUri:
    process.env.MONGODB_URI ??
    "mongodb://localhost:27017/eyewear_shop_management?replicaSet=rs0",
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? "development-access-secret",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? "development-refresh-secret",
});
