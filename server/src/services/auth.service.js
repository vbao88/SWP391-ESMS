import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { OtpToken } from "../models/OtpToken.js";
import { User } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { generateOtp, hashOtp } from "../utils/otp.js";
import { sendVerificationOtp } from "./email.service.js";

const PASSWORD_COST_FACTOR = 12;
const EMAIL_VERIFICATION_PURPOSE = "email_verification";

function isDuplicateKeyError(error) {
  return error?.code === 11000 || error?.cause?.code === 11000;
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

export const authService = Object.freeze({ registerCustomer });
