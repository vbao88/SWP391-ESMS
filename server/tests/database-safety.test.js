import { describe, expect, it } from "vitest";
import {
  assertSafeTestDatabaseName,
  TEST_DATABASE_NAME,
} from "./helpers/database.js";

describe("test database safety guard", () => {
  it("accepts only the dedicated test database name", () => {
    expect(() => assertSafeTestDatabaseName(TEST_DATABASE_NAME)).not.toThrow();
  });

  it("rejects the development database name", () => {
    expect(() => assertSafeTestDatabaseName("eyewear_shop_management")).toThrow(
      "Refusing destructive test cleanup",
    );
  });
});
