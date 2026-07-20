import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { User } from "../src/models/User.js";
import {
  clearTestCollections,
  connectTestDatabase,
  disconnectTestDatabase,
} from "./helpers/database.js";

function userData(overrides = {}) {
  return {
    fullName: "Le Van Bao",
    email: "bao@example.com",
    passwordHash: "fixture-password-hash",
    role: "customer",
    adminLevel: null,
    branchId: null,
    status: "active",
    emailVerifiedAt: new Date(),
    failedLoginAttempts: 0,
    lockedUntil: null,
    ...overrides,
  };
}

beforeAll(async () => {
  await connectTestDatabase();
  await User.init();
});

beforeEach(async () => {
  await clearTestCollections([User]);
});

afterAll(async () => {
  await clearTestCollections([User]);
  await disconnectTestDatabase();
});

describe("User refresh sessions", () => {
  it("defaults old-style users to an empty refreshSessions array", async () => {
    const user = await User.create(userData());
    const withSessions = await User.findById(user._id).select("+refreshSessions");

    expect(withSessions.refreshSessions).toEqual([]);
  });

  it("stores a refresh-session subdocument without an automatic _id or raw token", async () => {
    const user = await User.create(userData({
      refreshSessions: [{
        sessionId: "session-1",
        tokenHash: "a".repeat(64),
        familyId: "family-1",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      }],
    }));
    const stored = await User.findById(user._id).select("+refreshSessions");
    const session = stored.refreshSessions[0];

    expect(session._id).toBeUndefined();
    expect(session.toObject({ transform: false })).not.toHaveProperty("token");
  });

  it("does not select or serialize refreshSessions and tokenHash normally", async () => {
    const user = await User.create(userData({
      refreshSessions: [{
        sessionId: "session-1",
        tokenHash: "a".repeat(64),
        familyId: "family-1",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      }],
    }));
    const normalUser = await User.findById(user._id);
    const serialized = JSON.stringify(normalUser);

    expect(normalUser.refreshSessions).toBeUndefined();
    expect(serialized).not.toContain("refreshSessions");
    expect(serialized).not.toContain("tokenHash");
  });

  it("preserves all existing Phase 1 authentication fields", async () => {
    const branchId = new mongoose.Types.ObjectId();
    const user = await User.create(userData({
      branchId,
      status: "pending_activation",
      emailVerifiedAt: null,
      failedLoginAttempts: 3,
      lockedUntil: new Date(Date.now() + 60_000),
    }));

    expect(user).toMatchObject({
      role: "customer",
      adminLevel: null,
      status: "pending_activation",
      emailVerifiedAt: null,
      failedLoginAttempts: 3,
    });
    expect(user.branchId).toEqual(branchId);
    expect(user.lockedUntil).toBeInstanceOf(Date);
  });
});
