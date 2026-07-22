import { Router } from "express";
import { createBrand, updateBrand, updateBrandStatus } from "../controllers/brand.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireSuperAdmin } from "../middlewares/authorization.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  brandParamsSchema,
  createBrandSchema,
  updateBrandSchema,
  updateBrandStatusSchema,
} from "../validations/product-reference.validation.js";

export const brandRouter = Router();

brandRouter.post(
  "/",
  authenticate,
  requireSuperAdmin,
  validate(createBrandSchema),
  asyncHandler(createBrand),
);

brandRouter.patch(
  "/:brandId/status",
  authenticate,
  requireSuperAdmin,
  validate(brandParamsSchema, "params"),
  validate(updateBrandStatusSchema),
  asyncHandler(updateBrandStatus),
);

brandRouter.patch(
  "/:brandId",
  authenticate,
  requireSuperAdmin,
  validate(brandParamsSchema, "params"),
  validate(updateBrandSchema),
  asyncHandler(updateBrand),
);
