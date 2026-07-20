import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { OtpToken } from "../models/OtpToken.js";
import { User } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { generateOtp, hashOtp, verifyOtpHash } from "../utils/otp.js";
import {
  countActiveRefreshSessions,
  createRefreshSession,
  createRefreshToken,
  generateSecureTokenId,
  hashRefreshToken,
  parseDurationToMilliseconds,
  removeExpiredRefreshSessions,
  selectOldestActiveRefreshSession,
  signAccessToken,
  verifyRefreshToken,
  verifyRefreshTokenHash,
} from "../utils/token.js";
import { sendVerificationOtp } from "./email.service.js";

const PASSWORD_COST_FACTOR = 12;
const EMAIL_VERIFICATION_PURPOSE = "email_verification";
const INVALID_OTP_MESSAGE = "OTP is incorrect or expired.";
const RESEND_COOLDOWN_MESSAGE = "Please wait before requesting another OTP.";
const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password.";
const FAILED_LOGIN_THRESHOLD = 5;
const LOGIN_PERSISTENCE_ATTEMPTS = 5;
const DUMMY_PASSWORD_HASH = "$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW";
const INVALID_SESSION_MESSAGE = "Invalid or expired session.";

function invalidCredentialsError() {
  return new ApiError(401, INVALID_CREDENTIALS_MESSAGE);
}

function invalidSessionError() {
  return new ApiError(401, INVALID_SESSION_MESSAGE);
}

async function revokeSessionsForIneligibleUser(user, now) {
  const revokedReason = isTemporarilyLocked(user, now)
    ? "account_locked"
    : "security_status_changed";

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        "refreshSessions.$[activeSession].revokedAt": now,
        "refreshSessions.$[activeSession].revokedReason": revokedReason,
      },
      $inc: { __v: 1 },
    },
    {
      arrayFilters: [
        {
          "activeSession.revokedAt": null,
          "activeSession.expiresAt": { $gt: now },
        },
      ],
    },
  );
}

async function refreshSession({ refreshToken, ipAddress = null, userAgent = null }) {
  if (typeof refreshToken !== "string" || refreshToken.length === 0) {
    throw invalidSessionError();
  }

  let claims;

  try {
    claims = verifyRefreshToken(refreshToken);
  } catch {
    throw invalidSessionError();
  }

  if (!mongoose.isObjectIdOrHexString(claims.sub)) {
    throw invalidSessionError();
  }

  const now = new Date();
  const user = await User.findById(claims.sub).select(
    "+refreshSessions +refreshSessions.tokenHash",
  );

  if (!user) {
    throw invalidSessionError();
  }

  if (
    user.status !== "active" ||
    !user.emailVerifiedAt ||
    isTemporarilyLocked(user, now)
  ) {
    await revokeSessionsForIneligibleUser(user, now);
    throw invalidSessionError();
  }

  const presentedSession = user.refreshSessions.find(
    (session) => session.sessionId === claims.sid && session.familyId === claims.familyId,
  );

  if (
    !presentedSession ||
    presentedSession.revokedAt ||
    presentedSession.expiresAt <= now ||
    !verifyRefreshTokenHash({ token: refreshToken, tokenHash: presentedSession.tokenHash })
  ) {
    throw invalidSessionError();
  }

  const newSessionId = generateSecureTokenId();
  const newRefreshToken = createRefreshToken({
    userId: user._id,
    sessionId: newSessionId,
    familyId: claims.familyId,
  });
  const newSession = createRefreshSession({
    sessionId: newSessionId,
    tokenHash: hashRefreshToken(newRefreshToken),
    familyId: claims.familyId,
    createdAt: now,
    expiresAt: new Date(
      now.getTime() + parseDurationToMilliseconds(env.jwtRefreshExpiresIn),
    ),
    ipAddress,
    userAgent,
  });
  const retainedSessions = removeExpiredRefreshSessions(user.refreshSessions, now).map(
    (session) =>
      typeof session.toObject === "function"
        ? session.toObject({ transform: false })
        : { ...session },
  );
  const oldSessionIndex = retainedSessions.findIndex(
    (session) => session.sessionId === claims.sid && session.familyId === claims.familyId,
  );

  if (oldSessionIndex < 0) {
    throw invalidSessionError();
  }

  retainedSessions[oldSessionIndex] = {
    ...retainedSessions[oldSessionIndex],
    revokedAt: now,
    revokedReason: "rotated",
    lastUsedAt: now,
    replacedBySessionId: newSessionId,
  };

  const rotation = await User.updateOne(
    {
      _id: user._id,
      __v: user.__v,
      status: "active",
      emailVerifiedAt: { $ne: null },
      $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
      refreshSessions: {
        $elemMatch: {
          sessionId: claims.sid,
          familyId: claims.familyId,
          tokenHash: hashRefreshToken(refreshToken),
          revokedAt: null,
          expiresAt: { $gt: now },
        },
      },
    },
    {
      $set: { refreshSessions: [...retainedSessions, newSession] },
      $inc: { __v: 1 },
    },
  );

  if (rotation.modifiedCount !== 1) {
    throw invalidSessionError();
  }

  return {
    accessToken: signAccessToken(user),
    expiresIn: env.jwtAccessExpiresIn,
    newRefreshToken,
  };
}

async function logoutSession({ refreshToken } = {}) {
  if (typeof refreshToken !== "string" || refreshToken.length === 0) {
    return null;
  }

  let claims;

  try {
    claims = verifyRefreshToken(refreshToken, { ignoreExpiration: true });
  } catch {
    return null;
  }

  if (!mongoose.isObjectIdOrHexString(claims.sub)) {
    return null;
  }

  let user;

  try {
    user = await User.findById(claims.sub).select(
      "+refreshSessions +refreshSessions.tokenHash",
    );
  } catch {
    throw new ApiError(503, "Logout could not be completed. Please try again.");
  }

  if (!user) {
    return null;
  }

  const storedSession = user.refreshSessions.find(
    (session) => session.sessionId === claims.sid && session.familyId === claims.familyId,
  );

  if (
    !storedSession ||
    storedSession.revokedAt ||
    !verifyRefreshTokenHash({ token: refreshToken, tokenHash: storedSession.tokenHash })
  ) {
    return null;
  }

  const now = new Date();
  try {
    await User.updateOne(
      {
        _id: user._id,
        refreshSessions: {
          $elemMatch: {
            sessionId: claims.sid,
            familyId: claims.familyId,
            tokenHash: hashRefreshToken(refreshToken),
            revokedAt: null,
          },
        },
      },
      {
        $set: {
          "refreshSessions.$[currentSession].revokedAt": now,
          "refreshSessions.$[currentSession].revokedReason": "logout",
          "refreshSessions.$[currentSession].lastUsedAt": now,
        },
        $inc: { __v: 1 },
      },
      {
        arrayFilters: [
          {
            "currentSession.sessionId": claims.sid,
            "currentSession.familyId": claims.familyId,
            "currentSession.tokenHash": hashRefreshToken(refreshToken),
            "currentSession.revokedAt": null,
          },
        ],
      },
    );
  } catch {
    throw new ApiError(503, "Logout could not be completed. Please try again.");
  }

  return null;
}

function isTemporarilyLocked(user, now) {
  return user.lockedUntil instanceof Date && user.lockedUntil > now;
}

async function recordFailedLogin(userId, now) {
  const lockUntil = new Date(now.getTime() + env.accountLockMinutes * 60_000);

  await User.updateOne(
    {
      _id: userId,
      $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
    },
    [
      {
        $set: {
          failedLoginAttempts: {
            $min: [
              FAILED_LOGIN_THRESHOLD,
              {
                $add: [
                  {
                    $cond: [
                      {
                        $and: [
                          { $ne: ["$lockedUntil", null] },
                          { $lte: ["$lockedUntil", now] },
                        ],
                      },
                      0,
                      { $ifNull: ["$failedLoginAttempts", 0] },
                    ],
                  },
                  1,
                ],
              },
            ],
          },
        },
      },
      {
        $set: {
          lockedUntil: {
            $cond: [
              { $gte: ["$failedLoginAttempts", FAILED_LOGIN_THRESHOLD] },
              lockUntil,
              null,
            ],
          },
          refreshSessions: {
            $cond: [
              { $gte: ["$failedLoginAttempts", FAILED_LOGIN_THRESHOLD] },
              {
                $map: {
                  input: { $ifNull: ["$refreshSessions", []] },
                  as: "refreshSession",
                  in: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ["$$refreshSession.revokedAt", null] },
                          { $gt: ["$$refreshSession.expiresAt", now] },
                        ],
                      },
                      {
                        $mergeObjects: [
                          "$$refreshSession",
                          { revokedAt: now, revokedReason: "account_locked" },
                        ],
                      },
                      "$$refreshSession",
                    ],
                  },
                },
              },
              { $ifNull: ["$refreshSessions", []] },
            ],
          },
          __v: { $add: [{ $ifNull: ["$__v", 0] }, 1] },
        },
      },
    ],
    { updatePipeline: true },
  );
}

function prepareSessionsForLogin(sessions, newSession, now) {
  const retainedSessions = removeExpiredRefreshSessions(sessions, now).map((session) =>
    typeof session.toObject === "function" ? session.toObject({ transform: false }) : { ...session },
  );

  if (countActiveRefreshSessions(retainedSessions, now) >= env.maxActiveRefreshSessions) {
    const oldest = selectOldestActiveRefreshSession(retainedSessions, now);
    const oldestIndex = retainedSessions.findIndex(
      ({ sessionId }) => sessionId === oldest?.sessionId,
    );

    if (oldestIndex >= 0) {
      retainedSessions[oldestIndex] = {
        ...retainedSessions[oldestIndex],
        revokedAt: now,
        revokedReason: "session_limit",
      };
    }
  }

  return [...retainedSessions, newSession];
}

function safeUserPayload(user) {
  return {
    id: user._id.toString(),
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    adminLevel: user.adminLevel ?? null,
    branchId: user.branchId?.toString() ?? null,
    status: user.status,
  };
}

async function persistLoginSession({ userId, newSession, now }) {
  for (let attempt = 0; attempt < LOGIN_PERSISTENCE_ATTEMPTS; attempt += 1) {
    const currentUser = await User.findById(userId).select(
      "+refreshSessions +refreshSessions.tokenHash",
    );

    if (
      !currentUser ||
      currentUser.status !== "active" ||
      !currentUser.emailVerifiedAt ||
      isTemporarilyLocked(currentUser, now)
    ) {
      throw invalidCredentialsError();
    }

    const refreshSessions = prepareSessionsForLogin(
      currentUser.refreshSessions ?? [],
      newSession,
      now,
    );
    const update = await User.updateOne(
      {
        _id: currentUser._id,
        __v: currentUser.__v,
        status: "active",
        emailVerifiedAt: { $ne: null },
        $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
      },
      {
        $set: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          refreshSessions,
        },
        $inc: { __v: 1 },
      },
    );

    if (update.modifiedCount === 1) {
      return currentUser;
    }
  }

  throw new ApiError(503, "Login could not be completed. Please try again.");
}

async function login({ email, password, userAgent = null, ipAddress = null }) {
  const normalizedEmail = email.toLowerCase();
  const now = new Date();
  const user = await User.findOne({ email: normalizedEmail }).select(
    "+passwordHash +refreshSessions +refreshSessions.tokenHash",
  );

  if (!user) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    throw invalidCredentialsError();
  }

  if (isTemporarilyLocked(user, now)) {
    throw invalidCredentialsError();
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    await recordFailedLogin(user._id, now);
    throw invalidCredentialsError();
  }

  if (user.status !== "active" || !user.emailVerifiedAt) {
    throw invalidCredentialsError();
  }

  const sessionId = generateSecureTokenId();
  const familyId = generateSecureTokenId();
  const refreshToken = createRefreshToken({ userId: user._id, sessionId, familyId });
  const newSession = createRefreshSession({
    sessionId,
    tokenHash: hashRefreshToken(refreshToken),
    familyId,
    createdAt: now,
    expiresAt: new Date(
      now.getTime() + parseDurationToMilliseconds(env.jwtRefreshExpiresIn),
    ),
    userAgent,
    ipAddress,
  });
  const persistedUser = await persistLoginSession({ userId: user._id, newSession, now });
  const accessToken = signAccessToken(persistedUser);

  return {
    refreshToken,
    data: {
      accessToken,
      expiresIn: env.jwtAccessExpiresIn,
      user: safeUserPayload(persistedUser),
    },
  };
}

function isDuplicateKeyError(error) {
  return error?.code === 11000 || error?.cause?.code === 11000;
}

function assertVerificationEligibility(user) {
  if (user.emailVerifiedAt || user.status === "active") {
    throw new ApiError(409, "Email is already verified");
  }

  if (user.status !== "pending_activation") {
    throw new ApiError(409, "Account is not eligible for email verification");
  }
}

function getRemainingCooldownSeconds(token, now) {
  if (!token) {
    return 0;
  }

  const cooldownEndsAt = token.createdAt.getTime() + env.otpResendCooldownSeconds * 1_000;
  return Math.max(0, Math.ceil((cooldownEndsAt - now.getTime()) / 1_000));
}

function createCooldownError(remainingSeconds) {
  const error = new ApiError(429, RESEND_COOLDOWN_MESSAGE);
  error.retryAfterSeconds = remainingSeconds;
  return error;
}

async function registerCustomer({ fullName, email, password }) {
  const normalizedEmail = email.toLowerCase();
  const existingUser = await User.exists({ email: normalizedEmail });

  if (existingUser) {
    throw new ApiError(409, "Email already exists");
  }

  const passwordHash = await bcrypt.hash(password, PASSWORD_COST_FACTOR);
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + env.otpExpiresMinutes * 60_000);
  const session = await mongoose.startSession();
  let createdUser;

  try {
    await session.withTransaction(async () => {
      [createdUser] = await User.create(
        [
          {
            fullName,
            email: normalizedEmail,
            passwordHash,
            role: "customer",
            adminLevel: null,
            branchId: null,
            status: "pending_activation",
            emailVerifiedAt: null,
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        ],
        { session },
      );

      const tokenHash = hashOtp({
        otp,
        userId: createdUser._id,
        purpose: EMAIL_VERIFICATION_PURPOSE,
      });

      await OtpToken.create(
        [
          {
            userId: createdUser._id,
            purpose: EMAIL_VERIFICATION_PURPOSE,
            tokenHash,
            expiresAt,
            isActive: true,
            usedAt: null,
            invalidatedAt: null,
          },
        ],
        { session },
      );
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (isDuplicateKeyError(error) || (await User.exists({ email: normalizedEmail }))) {
      throw new ApiError(409, "Email already exists");
    }

    throw error;
  } finally {
    await session.endSession();
  }

  try {
    await sendVerificationOtp({
      email: createdUser.email,
      otp,
      purpose: EMAIL_VERIFICATION_PURPOSE,
      expiresMinutes: env.otpExpiresMinutes,
    });
  } catch (_error) {
    throw new ApiError(
      503,
      "Account created, but the verification OTP could not be delivered. Please request a new OTP.",
    );
  }

  return {
    email: createdUser.email,
    status: createdUser.status,
  };
}

async function verifyEmail({ email, otp }) {
  const normalizedEmail = email.toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    throw new ApiError(404, "Account does not exist");
  }

  assertVerificationEligibility(user);

  const token = await OtpToken.findOne({
    userId: user._id,
    purpose: EMAIL_VERIFICATION_PURPOSE,
  })
    .sort({ createdAt: -1 })
    .select("+tokenHash");

  if (!token || !token.isActive || token.usedAt || token.invalidatedAt) {
    throw new ApiError(400, INVALID_OTP_MESSAGE);
  }

  const checkedAt = new Date();

  if (token.expiresAt <= checkedAt) {
    await OtpToken.updateOne(
      {
        _id: token._id,
        isActive: true,
        usedAt: null,
        invalidatedAt: null,
        expiresAt: { $lte: checkedAt },
      },
      { $set: { isActive: false } },
    );
    throw new ApiError(400, INVALID_OTP_MESSAGE);
  }

  const isCorrectOtp = verifyOtpHash({
    otp,
    userId: user._id,
    purpose: EMAIL_VERIFICATION_PURPOSE,
    tokenHash: token.tokenHash,
  });

  if (!isCorrectOtp) {
    throw new ApiError(400, INVALID_OTP_MESSAGE);
  }

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const tokenUpdate = await OtpToken.updateOne(
        {
          _id: token._id,
          isActive: true,
          usedAt: null,
          invalidatedAt: null,
          expiresAt: { $gt: checkedAt },
        },
        {
          $set: {
            usedAt: checkedAt,
            isActive: false,
          },
        },
        { session },
      );

      if (tokenUpdate.modifiedCount !== 1) {
        throw new ApiError(400, INVALID_OTP_MESSAGE);
      }

      const userUpdate = await User.updateOne(
        {
          _id: user._id,
          status: "pending_activation",
          emailVerifiedAt: null,
        },
        {
          $set: {
            status: "active",
            emailVerifiedAt: checkedAt,
          },
        },
        { session },
      );

      if (userUpdate.modifiedCount !== 1) {
        throw new ApiError(409, "Account is not eligible for email verification");
      }
    });
  } finally {
    await session.endSession();
  }

  return {
    email: user.email,
    status: "active",
  };
}

async function resendVerificationOtp({ email }) {
  const normalizedEmail = email.toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    throw new ApiError(404, "Account does not exist");
  }

  assertVerificationEligibility(user);

  const previousToken = await OtpToken.findOne({
    userId: user._id,
    purpose: EMAIL_VERIFICATION_PURPOSE,
  }).sort({ createdAt: -1 });
  const initialCooldown = getRemainingCooldownSeconds(previousToken, new Date());

  if (initialCooldown > 0) {
    throw createCooldownError(initialCooldown);
  }

  const otp = generateOtp();
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const transactionNow = new Date();
      const newestToken = await OtpToken.findOne({
        userId: user._id,
        purpose: EMAIL_VERIFICATION_PURPOSE,
      })
        .sort({ createdAt: -1 })
        .session(session);
      const remainingCooldown = getRemainingCooldownSeconds(newestToken, transactionNow);

      if (remainingCooldown > 0) {
        throw createCooldownError(remainingCooldown);
      }

      const eligibleUser = await User.exists({
        _id: user._id,
        status: "pending_activation",
        emailVerifiedAt: null,
      }).session(session);

      if (!eligibleUser) {
        throw new ApiError(409, "Account is not eligible for email verification");
      }

      await OtpToken.updateMany(
        {
          userId: user._id,
          purpose: EMAIL_VERIFICATION_PURPOSE,
          isActive: true,
          usedAt: null,
        },
        {
          $set: {
            invalidatedAt: transactionNow,
            isActive: false,
          },
        },
        { session },
      );

      const tokenHash = hashOtp({
        otp,
        userId: user._id,
        purpose: EMAIL_VERIFICATION_PURPOSE,
      });

      await OtpToken.create(
        [
          {
            userId: user._id,
            purpose: EMAIL_VERIFICATION_PURPOSE,
            tokenHash,
            expiresAt: new Date(transactionNow.getTime() + env.otpExpiresMinutes * 60_000),
            usedAt: null,
            invalidatedAt: null,
            isActive: true,
          },
        ],
        { session },
      );
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (isDuplicateKeyError(error) || error?.hasErrorLabel?.("TransientTransactionError")) {
      const newestToken = await OtpToken.findOne({
        userId: user._id,
        purpose: EMAIL_VERIFICATION_PURPOSE,
      }).sort({ createdAt: -1 });
      const remainingCooldown = getRemainingCooldownSeconds(newestToken, new Date());

      if (remainingCooldown > 0) {
        throw createCooldownError(remainingCooldown);
      }

      throw new ApiError(409, "Another OTP resend request is already in progress");
    }

    throw error;
  } finally {
    await session.endSession();
  }

  try {
    await sendVerificationOtp({
      email: user.email,
      otp,
      purpose: EMAIL_VERIFICATION_PURPOSE,
      expiresMinutes: env.otpExpiresMinutes,
    });
  } catch (_error) {
    throw new ApiError(
      503,
      "A new OTP was generated, but it could not be delivered. Please try again later.",
    );
  }

  return { email: user.email };
}

export const authService = Object.freeze({
  login,
  logoutSession,
  refreshSession,
  registerCustomer,
  verifyEmail,
  resendVerificationOtp,
});
