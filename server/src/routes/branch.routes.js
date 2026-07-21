import { Router } from "express";
import {
  createBranch,
  getPublicBranch,
  listPublicBranches,
  updateBranch,
  updateBranchStatus,
} from "../controllers/branch.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireSuperAdmin } from "../middlewares/authorization.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  branchParamsSchema,
  createBranchSchema,
  updateBranchSchema,
  updateBranchStatusSchema,
} from "../validations/branch.validation.js";

export const branchRouter = Router();

/**
 * @openapi
 * /branches:
 *   get:
 *     summary: List active branches
 *     tags: [Branches]
 *     responses:
 *       200:
 *         description: Active branches ordered by ascending code
 *       429:
 *         description: Too many requests
 *       500:
 *         description: Internal server error
 */
branchRouter.get("/", asyncHandler(listPublicBranches));

branchRouter.post(
  "/",
  authenticate,
  requireSuperAdmin,
  validate(createBranchSchema),
  asyncHandler(createBranch),
);

/**
 * @openapi
 * /branches/{branchId}:
 *   get:
 *     summary: View an active branch
 *     tags: [Branches]
 *     parameters:
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[a-fA-F0-9]{24}$'
 *     responses:
 *       200:
 *         description: Active branch details
 *       400:
 *         description: Invalid branch identifier
 *       404:
 *         description: Branch not found
 *       429:
 *         description: Too many requests
 *       500:
 *         description: Internal server error
 */
branchRouter.get(
  "/:branchId",
  validate(branchParamsSchema, "params"),
  asyncHandler(getPublicBranch),
);

branchRouter.patch(
  "/:branchId/status",
  authenticate,
  requireSuperAdmin,
  validate(branchParamsSchema, "params"),
  validate(updateBranchStatusSchema),
  asyncHandler(updateBranchStatus),
);

branchRouter.patch(
  "/:branchId",
  authenticate,
  requireSuperAdmin,
  validate(branchParamsSchema, "params"),
  validate(updateBranchSchema),
  asyncHandler(updateBranch),
);
