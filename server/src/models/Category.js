import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["active", "inactive"],
      required: true,
      default: "active",
    },
  },
  { timestamps: true },
);

categorySchema.index(
  { name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);

export const Category =
  mongoose.models.Category ?? mongoose.model("Category", categorySchema);
