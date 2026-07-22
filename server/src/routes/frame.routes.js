import { Router } from "express";
import { listPublicFrames } from "../controllers/frame.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { listPublicFramesQuerySchema } from "../validations/frame.validation.js";

export const frameRouter = Router();

frameRouter.get(
  "/",
  validate(listPublicFramesQuerySchema, "query", { stripUnknown: false }),
  asyncHandler(listPublicFrames),
);
