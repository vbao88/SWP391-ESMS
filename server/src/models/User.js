import mongoose from "mongoose";

const REFRESH_SESSION_REVOKED_REASONS = [
  "rotated",
  "logout",
  "account_locked",
  "password_reset",
  "security_status_changed",
  "reuse_detected",
  "session_limit",
];

const refreshSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true },
    tokenHash: { type: String, required: true, select: false },
    familyId: { type: String, required: true },
    createdAt: { type: Date, required: true },
    lastUsedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: {
      type: String,
      enum: [...REFRESH_SESSION_REVOKED_REASONS, null],
      default: null,
    },
    replacedBySessionId: { type: String, default: null },
    userAgent: { type: String, default: null },
    ipAddress: { type: String, default: null },
  },
  { _id: false },
);

function removeRefreshSessions(_document, returnedObject) {
  delete returnedObject.refreshSessions;
  return returnedObject;
}

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["customer", "sales_staff", "prescription_staff", "administrator"],
      required: true,
    },
    adminLevel: {
      type: String,
      enum: ["branch_manager", "super_admin", null],
      default: null,
    },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null },
    status: {
      type: String,
      enum: ["pending_activation", "active", "locked", "inactive"],
      default: "pending_activation",
    },
    emailVerifiedAt: { type: Date, default: null },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    refreshSessions: {
      type: [refreshSessionSchema],
      default: [],
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: { transform: removeRefreshSessions },
    toObject: { transform: removeRefreshSessions },
  },
);

userSchema.index({ role: 1, branchId: 1, status: 1 });

export const User = mongoose.model("User", userSchema);
