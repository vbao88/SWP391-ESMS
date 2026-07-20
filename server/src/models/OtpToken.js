import mongoose from "mongoose";

const otpTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    purpose: {
      type: String,
      enum: ["email_verification"],
      required: true,
    },
    tokenHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    invalidatedAt: { type: Date, default: null },
    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

otpTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpTokenSchema.index({ userId: 1, purpose: 1, createdAt: -1 });
otpTokenSchema.index(
  { userId: 1, purpose: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
  },
);

export const OtpToken = mongoose.model("OtpToken", otpTokenSchema);
