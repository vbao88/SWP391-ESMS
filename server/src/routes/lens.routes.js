import { Router } from "express";
import { listPublicLenses } from "../controllers/lens.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { listPublicLensesQuerySchema } from "../validations/lens.validation.js";

export const lensRouter = Router();

lensRouter.get(
  "/",
  validate(listPublicLensesQuerySchema, "query", { stripUnknown: false }),
  asyncHandler(listPublicLenses),
);
