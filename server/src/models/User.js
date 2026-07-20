import mongoose from "mongoose";

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
  },
  { timestamps: true },
);

userSchema.index({ role: 1, branchId: 1, status: 1 });

export const User = mongoose.model("User", userSchema);
