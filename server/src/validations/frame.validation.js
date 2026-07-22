import Joi from "joi";

const objectId = Joi.string().pattern(/^[a-f\d]{24}$/i);
const shape = Joi.string().valid("round", "square", "rectangle", "oval").strict();
const material = Joi.string().valid("acetate", "metal", "titanium", "plastic").strict();
const gender = Joi.string().valid("unisex", "men", "women", "kids").strict();
const faceShapes = Joi.array()
  .items(Joi.string().valid("oval", "round", "square", "heart").strict())
  .min(1)
  .unique();

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

export const createFrameSchema = Joi.object({
  name: Joi.string().trim().required(),
  description: Joi.string().trim(),
  brandId: objectId.required(),
  categoryId: objectId.required(),
  shape: shape.required(),
  material: material.required(),
  gender: gender.required(),
  faceShapes: faceShapes.required(),
  images,
});

export const updateFrameSchema = Joi.object({
  name: Joi.string().trim(),
  description: Joi.string().trim(),
  brandId: objectId,
  categoryId: objectId,
  shape,
  material,
  gender,
  faceShapes,
  images,
  status: Joi.any().forbidden(),
  _id: Joi.any().forbidden(),
  createdAt: Joi.any().forbidden(),
  updatedAt: Joi.any().forbidden(),
}).min(1);

export const updateFrameStatusSchema = Joi.object({
  status: Joi.string().valid("active", "inactive").required().strict(),
});
