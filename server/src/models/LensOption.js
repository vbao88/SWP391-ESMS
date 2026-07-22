import mongoose from "mongoose";
import { Lens } from "./Lens.js";

function normalizeValue(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/gu, " ").toLowerCase() : value;
}

const lensOptionSchema = new mongoose.Schema(
  {
    lensId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lens",
      required: true,
      immutable: true,
      validate: {
        validator: async (value) => Boolean(await Lens.exists({ _id: value })),
        message: "Lens does not exist",
      },
    },
    type: {
      type: String,
      enum: ["coating", "tint"],
      required: true,
      immutable: true,
    },
    value: { type: String, required: true, trim: true },
    valueNormalized: { type: String, required: true },
    priceAdjustment: { type: Number, required: true, default: 0, validate: Number.isInteger },
    status: {
      type: String,
      enum: ["active", "inactive"],
      required: true,
      default: "active",
    },
  },
  { timestamps: true },
);

lensOptionSchema.pre("validate", function synchronizeNormalizedValue() {
  this.valueNormalized = normalizeValue(this.value);
});

function synchronizeQueryNormalizedValue() {
  const update = this.getUpdate();
  const values = { ...update, ...update.$set };

  if (typeof values.value === "string") {
    this.set({ valueNormalized: normalizeValue(values.value) });
  }
}

lensOptionSchema.pre("findOneAndUpdate", synchronizeQueryNormalizedValue);
lensOptionSchema.pre("updateOne", synchronizeQueryNormalizedValue);
lensOptionSchema.pre("updateMany", synchronizeQueryNormalizedValue);

lensOptionSchema.index(
  { lensId: 1, type: 1, valueNormalized: 1 },
  { unique: true },
);

export const LensOption =
  mongoose.models.LensOption ?? mongoose.model("LensOption", lensOptionSchema);
