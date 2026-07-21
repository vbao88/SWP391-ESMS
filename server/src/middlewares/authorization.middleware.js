import mongoose from "mongoose";
import { User } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const requireSuperAdmin = asyncHandler(async (request, _response, next) => {
  const userId = request.user?.userId;

  if (!mongoose.isObjectIdOrHexString(userId)) {
    throw new ApiError(401, "Invalid or expired access token");
  }

  const currentUser = await User.findById(userId, "status role adminLevel").lean();

  if (!currentUser) {
    throw new ApiError(401, "Invalid or expired access token");
  }

  if (
    currentUser.status !== "active" ||
    currentUser.role !== "administrator" ||
    currentUser.adminLevel !== "super_admin"
  ) {
    throw new ApiError(403, "Insufficient permission");
  }

  next();
});
