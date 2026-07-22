import Joi from "joi";

const SKU_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,63}$/;
const objectId = Joi.string().pattern(/^[a-f\d]{24}$/i);

function collapseWhitespace(value) {
  return value.trim().replace(/\s+/gu, " ");
}

const sku = Joi.string().trim().uppercase().pattern(SKU_PATTERN);
const color = Joi.string().trim().custom(collapseWhitespace);
const size = Joi.string().valid("S", "M", "L").strict();
const price = Joi.number().integer().min(0).strict();

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

const protectedCreateFields = {
  colorNormalized: Joi.any().forbidden(),
  sizeNormalized: Joi.any().forbidden(),
  _id: Joi.any().forbidden(),
  createdAt: Joi.any().forbidden(),
  updatedAt: Joi.any().forbidden(),
};

export const createFrameVariantSchema = Joi.object({
  frameId: objectId.required(),
  sku: sku.required(),
  color: color.required(),
  size: size.required(),
  price: price.required(),
  images,
  ...protectedCreateFields,
});

export const updateFrameVariantSchema = Joi.object({
  color,
  size,
  price,
  images,
  frameId: Joi.any().forbidden(),
  sku: Joi.any().forbidden(),
  status: Joi.any().forbidden(),
  colorNormalized: Joi.any().forbidden(),
  sizeNormalized: Joi.any().forbidden(),
  _id: Joi.any().forbidden(),
  createdAt: Joi.any().forbidden(),
  updatedAt: Joi.any().forbidden(),
}).min(1);

export const updateFrameVariantStatusSchema = Joi.object({
  status: Joi.string().valid("active", "inactive").required().strict(),
});
