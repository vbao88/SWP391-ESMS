import mongoose from "mongoose";
import { Frame } from "./Frame.js";

const SKU_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,63}$/;

function collapseWhitespace(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : value;
}

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

const frameVariantSchema = new mongoose.Schema(
  {
    frameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Frame",
      required: true,
      immutable: true,
      validate: {
        validator: async (value) => Boolean(await Frame.exists({ _id: value })),
        message: "Frame does not exist",
      },
    },
    sku: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: SKU_PATTERN,
      immutable: true,
    },
    color: { type: String, required: true, set: collapseWhitespace },
    colorNormalized: { type: String, required: true },
    size: { type: String, enum: ["S", "M", "L"], required: true },
    sizeNormalized: { type: String, required: true },
    price: { type: Number, required: true, min: 0, validate: Number.isInteger },
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

frameVariantSchema.pre("validate", function synchronizeNormalizedFields() {
  this.colorNormalized = collapseWhitespace(this.color)?.toLowerCase();
  this.sizeNormalized = this.size?.toLowerCase();
});

function synchronizeQueryNormalizedFields() {
  const update = this.getUpdate();
  const values = { ...update, ...update.$set };
  const synchronizedValues = {};

  if (typeof values.color === "string") {
    synchronizedValues.color = collapseWhitespace(values.color);
    synchronizedValues.colorNormalized = synchronizedValues.color.toLowerCase();
  }
  if (typeof values.size === "string") {
    synchronizedValues.sizeNormalized = values.size.toLowerCase();
  }
  if (Object.keys(synchronizedValues).length > 0) {
    this.set(synchronizedValues);
  }
}

frameVariantSchema.pre("findOneAndUpdate", synchronizeQueryNormalizedFields);
frameVariantSchema.pre("updateOne", synchronizeQueryNormalizedFields);
frameVariantSchema.pre("updateMany", synchronizeQueryNormalizedFields);

frameVariantSchema.index({ sku: 1 }, { unique: true });
frameVariantSchema.index({ frameId: 1, status: 1 });
frameVariantSchema.index(
  { frameId: 1, colorNormalized: 1, sizeNormalized: 1 },
  { unique: true },
);

export const FrameVariant =
  mongoose.models.FrameVariant ?? mongoose.model("FrameVariant", frameVariantSchema);
