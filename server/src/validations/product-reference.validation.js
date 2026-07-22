import Joi from "joi";

const name = Joi.string().trim().required();

function createSchema() {
  return Joi.object({ name });
}

function updateSchema() {
  return Joi.object({
    name,
    status: Joi.any().forbidden(),
    _id: Joi.any().forbidden(),
    createdAt: Joi.any().forbidden(),
    updatedAt: Joi.any().forbidden(),
  }).min(1);
}

function updateStatusSchema() {
  return Joi.object({
    status: Joi.string().valid("active", "inactive").required().strict(),
  });
}

export const createBrandSchema = createSchema();
export const updateBrandSchema = updateSchema();
export const updateBrandStatusSchema = updateStatusSchema();
export const createCategorySchema = createSchema();
export const updateCategorySchema = updateSchema();
export const updateCategoryStatusSchema = updateStatusSchema();
