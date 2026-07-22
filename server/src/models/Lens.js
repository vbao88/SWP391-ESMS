import mongoose from "mongoose";
import { Brand } from "./Brand.js";

function isAbsoluteHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const mediaSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, validate: isAbsoluteHttpUrl },
    publicId: { type: String, trim: true, minlength: 1 },
    altText: { type: String, required: true, trim: true, minlength: 1, maxlength: 160 },
    sortOrder: { type: Number, required: true, min: 0, max: 1000, validate: Number.isInteger },
    isPrimary: {
      type: Boolean,
      required: true,
      set(value) {
        if (typeof value !== "boolean") {
          throw new mongoose.Error.CastError("Boolean", value, "isPrimary");
        }
        return value;
      },
    },
  },
  { _id: false },
);

const lensSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: true,
      validate: {
        validator: async (value) => Boolean(await Brand.exists({ _id: value })),
        message: "Brand does not exist",
      },
    },
    visionType: {
      type: String,
      enum: ["non_prescription", "single_vision"],
      required: true,
    },
    refractiveIndex: {
      type: String,
      enum: ["1.50", "1.56", "1.60", "1.67"],
      required: true,
    },
    features: {
      type: [{ type: String, enum: ["blue_light", "photochromic"] }],
      required: true,
      default: [],
      validate: {
        validator: (values) => new Set(values).size === values.length,
        message: "Lens features must be unique",
      },
    },
    basePrice: { type: Number, required: true, min: 0, validate: Number.isInteger },
    images: {
      type: [mediaSchema],
      required: true,
      default: [],
      validate: {
        validator: (images) => images.filter(({ isPrimary }) => isPrimary).length <= 1,
        message: "Only one primary image is allowed",
      },
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      required: true,
      default: "active",
    },
  },
  { timestamps: true },
);

export const Lens = mongoose.models.Lens ?? mongoose.model("Lens", lensSchema);
