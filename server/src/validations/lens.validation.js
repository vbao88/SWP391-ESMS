import Joi from "joi";

const objectId = Joi.string().pattern(/^[a-f\d]{24}$/i);
const visionType = Joi.string().valid("non_prescription", "single_vision").strict();
const refractiveIndex = Joi.string().valid("1.50", "1.56", "1.60", "1.67").strict();
const features = Joi.array()
  .items(Joi.string().valid("blue_light", "photochromic").strict())
  .unique();
const basePrice = Joi.number().integer().min(0).strict();

const media = Joi.object({
  url: Joi.string().uri({ scheme: ["http", "https"] }).required(),
  publicId: Joi.string().trim().min(1),
  altText: Joi.string().trim().min(1).max(160).required(),
  sortOrder: Joi.number().integer().min(0).max(1000).required().strict(),
  isPrimary: Joi.boolean().required().strict(),
});

const images = Joi.array()
  .items(media)
  .custom((value, helpers) => {
    if (value.filter(({ isPrimary }) => isPrimary).length > 1) {
      return helpers.message({ custom: "images must contain at most one primary image" });
    }
    return value;
  });

export const createLensSchema = Joi.object({
  name: Joi.string().trim().required(),
  description: Joi.string().trim(),
  brandId: objectId.required(),
  visionType: visionType.required(),
  refractiveIndex: refractiveIndex.required(),
  features,
  basePrice: basePrice.required(),
  images,
  _id: Joi.any().forbidden(),
  createdAt: Joi.any().forbidden(),
  updatedAt: Joi.any().forbidden(),
});

export const updateLensSchema = Joi.object({
  name: Joi.string().trim(),
  description: Joi.string().trim(),
  brandId: objectId,
  visionType,
  refractiveIndex,
  features,
  basePrice,
  images,
  status: Joi.any().forbidden(),
  _id: Joi.any().forbidden(),
  createdAt: Joi.any().forbidden(),
  updatedAt: Joi.any().forbidden(),
}).min(1);

export const updateLensStatusSchema = Joi.object({
  status: Joi.string().valid("active", "inactive").required().strict(),
});
