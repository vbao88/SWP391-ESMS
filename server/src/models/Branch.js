import mongoose from "mongoose";

const operatingHoursSchema = new mongoose.Schema(
  {
    open: { type: String, default: "09:00" },
    close: { type: String, default: "21:00" },
  },
  { _id: false },
);

const branchSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    district: { type: String, required: true, trim: true },
    city: { type: String, default: "Hà Nội", trim: true },
    address: { type: String, required: true, trim: true },
    phone: { type: String, default: "" },
    eyeExamEnabled: { type: Boolean, default: true },
    operatingHours: { type: operatingHoursSchema, default: () => ({}) },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true },
);

export const Branch = mongoose.model("Branch", branchSchema);
