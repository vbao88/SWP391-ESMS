import mongoose from "mongoose";
import { env } from "../../src/config/env.js";

export const TEST_DATABASE_NAME = "eyewear_shop_management_test";

export function assertSafeTestDatabaseName(databaseName) {
  if (databaseName !== TEST_DATABASE_NAME) {
    throw new Error(
      `Refusing destructive test cleanup for database: ${databaseName || "<unknown>"}`,
    );
  }
}

export async function connectTestDatabase() {
  if (env.nodeEnv !== "test" || !env.mongoTestUri) {
    throw new Error("Test database connection requires NODE_ENV=test and MONGODB_TEST_URI");
  }

  await mongoose.connect(env.mongoTestUri, { serverSelectionTimeoutMS: 10_000 });
  assertSafeTestDatabaseName(mongoose.connection.name);
}

export async function clearTestCollections(models) {
  assertSafeTestDatabaseName(mongoose.connection.name);

  for (const model of models) {
    await model.deleteMany({});
  }
}

export async function disconnectTestDatabase() {
  await mongoose.disconnect();
}
