import { execFileSync, spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { env } from "../src/config/env.js";

const importEnvScript = `
  const { env } = await import('./src/config/env.js');
  process.stdout.write(JSON.stringify({
    jwtAccessExpiresIn: env.jwtAccessExpiresIn,
    jwtRefreshExpiresIn: env.jwtRefreshExpiresIn,
    jwtAccessSecret: env.jwtAccessSecret,
    jwtRefreshSecret: env.jwtRefreshSecret,
    cookieName: env.refreshCookieName,
  }));
`;

function runEnvImport(environment) {
  return spawnSync(process.execPath, ["--input-type=module", "--eval", importEnvScript], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...environment },
  });
}

function parseLastJsonLine(output) {
  return JSON.parse(output.trim().split(/\r?\n/).at(-1));
}

describe("authentication environment configuration", () => {
  it("reads configured JWT expiries and session settings", () => {
    expect(env.jwtAccessExpiresIn).toBe(process.env.JWT_ACCESS_EXPIRES_IN ?? "15m");
    expect(env.jwtRefreshExpiresIn).toBe(process.env.JWT_REFRESH_EXPIRES_IN ?? "7d");
    expect(env.accountLockMinutes).toBeGreaterThan(0);
    expect(env.maxActiveRefreshSessions).toBeGreaterThan(0);
    expect(env.refreshCookieName).toMatch(/^[!#$%&'*+.^_`|~\dA-Za-z-]+$/);
  });

  it.each([
    ["ACCOUNT_LOCK_MINUTES", "0"],
    ["MAX_ACTIVE_REFRESH_SESSIONS", "invalid"],
  ])("rejects invalid %s", (name, value) => {
    const result = runEnvImport({ NODE_ENV: "test", [name]: value });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`${name} must be a positive integer`);
  });

  it.each([
    ["JWT_ACCESS_EXPIRES_IN", "15"],
    ["JWT_REFRESH_EXPIRES_IN", "0d"],
  ])("rejects invalid %s", (name, value) => {
    const result = runEnvImport({ NODE_ENV: "test", [name]: value });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`${name} must be a positive duration`);
  });

  it("uses deterministic fallback JWT secrets only in test mode", () => {
    const testResult = runEnvImport({
      NODE_ENV: "test",
      JWT_ACCESS_SECRET: "",
      JWT_REFRESH_SECRET: "",
    });
    const testConfiguration = parseLastJsonLine(testResult.stdout);

    expect(testResult.status).toBe(0);
    expect(testConfiguration.jwtAccessSecret).toBe("test-only-jwt-access-secret");
    expect(testConfiguration.jwtRefreshSecret).toBe("test-only-jwt-refresh-secret");

    const developmentResult = runEnvImport({
      NODE_ENV: "development",
      JWT_ACCESS_SECRET: "",
      JWT_REFRESH_SECRET: "",
      OTP_HASH_SECRET: "test-otp-secret",
    });
    expect(developmentResult.status).not.toBe(0);
    expect(developmentResult.stderr).toContain("JWT_ACCESS_SECRET is required");
    expect(developmentResult.stderr).not.toContain("test-only-jwt-access-secret");
  });

  it("uses secure SameSite Lax cookie options in production", () => {
    const script = `
      const { getRefreshCookieOptions } = await import('./src/utils/token.js');
      process.stdout.write(JSON.stringify(getRefreshCookieOptions()));
    `;
    const output = execFileSync(process.execPath, ["--input-type=module", "--eval", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "production",
        MONGODB_URI: "mongodb://localhost:27017/unused",
        CLIENT_URL: "https://example.com",
        JWT_ACCESS_SECRET: "production-access-test-secret",
        JWT_REFRESH_SECRET: "production-refresh-test-secret",
        OTP_HASH_SECRET: "production-otp-test-secret",
      },
    });
    const options = parseLastJsonLine(output);

    expect(options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/api/v1/auth",
    });
    expect(options).not.toHaveProperty("domain");
  });
});
