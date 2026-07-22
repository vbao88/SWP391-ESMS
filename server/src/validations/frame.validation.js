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

function commaSeparated(name, allowedValues, normalize = (value) => value) {
  return Joi.string().custom((value, helpers) => {
    const tokens = value.split(",").map((token) => normalize(token.trim()));
    if (tokens.some((token) => token.length === 0)) {
      return helpers.message({ custom: `${name} must not contain empty values` });
    }
    if (allowedValues && tokens.some((token) => !allowedValues.includes(token))) {
      return helpers.message({ custom: `${name} contains an invalid value` });
    }
    return [...new Set(tokens)];
  });
}

const objectIds = commaSeparated("identifier", null).custom((values, helpers) => {
  if (values.some((value) => !/^[a-f\d]{24}$/i.test(value))) {
    return helpers.message({ custom: "identifier must contain valid ObjectIds" });
  }
  return values;
});

export const listPublicFramesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().custom((value) => value.replace(/\s+/gu, " ")),
  brandId: objectIds,
  categoryId: objectIds,
  shape: commaSeparated("shape", ["round", "square", "rectangle", "oval"]),
  material: commaSeparated("material", ["acetate", "metal", "titanium", "plastic"]),
  color: commaSeparated("color", null, (value) => value.replace(/\s+/gu, " ").toLowerCase()),
  gender: commaSeparated("gender", ["unisex", "men", "women", "kids"]),
  faceShape: commaSeparated("faceShape", ["oval", "round", "square", "heart"]),
  minPrice: Joi.number().integer().min(0),
  maxPrice: Joi.number().integer().min(0),
  sort: Joi.string().valid("name", "price", "createdAt").default("name"),
  order: Joi.string().valid("asc", "desc").default("asc"),
})
  .custom((value, helpers) => {
    if (value.minPrice !== undefined && value.maxPrice !== undefined && value.minPrice > value.maxPrice) {
      return helpers.message({ custom: "minPrice must be less than or equal to maxPrice" });
    }
    return value;
  })
  .unknown(false);
