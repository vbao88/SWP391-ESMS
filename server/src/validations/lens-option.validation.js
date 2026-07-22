import Joi from "joi";

const objectId = Joi.string().pattern(/^[a-f\d]{24}$/i);
const type = Joi.string().valid("coating", "tint").strict();
const value = Joi.string().trim();
const priceAdjustment = Joi.number().integer().strict();

export const createLensOptionSchema = Joi.object({
  lensId: objectId.required(),
  type: type.required(),
  value: value.required(),
  priceAdjustment,
  valueNormalized: Joi.any().forbidden(),
  _id: Joi.any().forbidden(),
  createdAt: Joi.any().forbidden(),
  updatedAt: Joi.any().forbidden(),
});

export const updateLensOptionSchema = Joi.object({
  value,
  priceAdjustment,
  lensId: Joi.any().forbidden(),
  type: Joi.any().forbidden(),
  valueNormalized: Joi.any().forbidden(),
  status: Joi.any().forbidden(),
  _id: Joi.any().forbidden(),
  createdAt: Joi.any().forbidden(),
  updatedAt: Joi.any().forbidden(),
}).min(1);

export const updateLensOptionStatusSchema = Joi.object({
  status: Joi.string().valid("active", "inactive").required().strict(),
});
