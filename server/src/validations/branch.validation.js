import Joi from "joi";

const DEFAULT_OPEN_TIME = "09:00";
const DEFAULT_CLOSE_TIME = "21:00";
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

const objectId = Joi.string()
  .pattern(/^[a-f\d]{24}$/i)
  .required()
  .messages({
    "any.required": "branchId is required",
    "string.empty": "branchId is required",
    "string.pattern.base": "branchId must be a valid MongoDB ObjectId",
  });

export const branchParamsSchema = Joi.object({
  branchId: objectId,
});

const operatingHoursSchema = Joi.object({
  open: Joi.string().pattern(TIME_PATTERN),
  close: Joi.string().pattern(TIME_PATTERN),
});

export const createBranchSchema = Joi.object({
  code: Joi.string().trim().required(),
  name: Joi.string().trim().required(),
  district: Joi.string().trim().required(),
  city: Joi.string().trim(),
  address: Joi.string().trim().required(),
  phone: Joi.string().trim().allow(""),
  eyeExamEnabled: Joi.boolean().strict(),
  operatingHours: operatingHoursSchema,
}).custom((value, helpers) => {
  const open = value.operatingHours?.open ?? DEFAULT_OPEN_TIME;
  const close = value.operatingHours?.close ?? DEFAULT_CLOSE_TIME;

  if (timeToMinutes(open) >= timeToMinutes(close)) {
    return helpers.message({ custom: "operatingHours.open must be earlier than close" });
  }

  return value;
});

export const updateBranchSchema = Joi.object({
  code: Joi.any().forbidden(),
  name: Joi.string().trim(),
  district: Joi.string().trim(),
  city: Joi.string().trim(),
  address: Joi.string().trim(),
  phone: Joi.string().trim().allow(""),
  eyeExamEnabled: Joi.boolean().strict(),
  operatingHours: operatingHoursSchema,
}).min(1);

export const updateBranchStatusSchema = Joi.object({
  status: Joi.string().valid("active", "inactive").required().strict(),
});
