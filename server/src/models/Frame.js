import mongoose from "mongoose";
import { Brand } from "./Brand.js";
import { Category } from "./Category.js";

const SHAPES = ["round", "square", "rectangle", "oval"];
const MATERIALS = ["acetate", "metal", "titanium", "plastic"];
const GENDERS = ["unisex", "men", "women", "kids"];
const FACE_SHAPES = ["oval", "round", "square", "heart"];

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

function existingReference(Model, label) {
  return {
    validator: async (value) => Boolean(await Model.exists({ _id: value })),
    message: `${label} does not exist`,
  };
}

const frameSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: true,
      validate: existingReference(Brand, "Brand"),
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      validate: existingReference(Category, "Category"),
    },
    shape: { type: String, enum: SHAPES, required: true },
    material: { type: String, enum: MATERIALS, required: true },
    gender: { type: String, enum: GENDERS, required: true },
    faceShapes: {
      type: [{ type: String, enum: FACE_SHAPES }],
      required: true,
      validate: [
        { validator: (values) => values.length > 0, message: "At least one face shape is required" },
        {
          validator: (values) => new Set(values).size === values.length,
          message: "Face shapes must be unique",
        },
      ],
    },
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

frameSchema.index({ brandId: 1, categoryId: 1, status: 1 });

export const Frame = mongoose.models.Frame ?? mongoose.model("Frame", frameSchema);
