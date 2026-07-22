import { Router } from "express";
import { getPublicFrameDetail, listPublicFrames } from "../controllers/frame.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  listPublicFramesQuerySchema,
  publicFrameDetailParamsSchema,
} from "../validations/frame.validation.js";

export const frameRouter = Router();

frameRouter.get(
  "/",
  validate(listPublicFramesQuerySchema, "query", { stripUnknown: false }),
  asyncHandler(listPublicFrames),
);

frameRouter.get(
  "/:frameId",
  validate(publicFrameDetailParamsSchema, "params", { stripUnknown: false }),
  asyncHandler(getPublicFrameDetail),
);
