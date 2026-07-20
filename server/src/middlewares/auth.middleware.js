import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

export function authenticate(request, _response, next) {
  const authorization = request.headers.authorization;
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : null;

  if (!token) {
    return next(new ApiError(401, "Authentication required"));
  }

  try {
    request.auth = jwt.verify(token, env.jwtAccessSecret);
    return next();
  } catch {
    return next(new ApiError(401, "Invalid or expired access token"));
  }
}

export const authorizeRoles = (...roles) => (request, _response, next) => {
  if (!request.auth || !roles.includes(request.auth.role)) {
    return next(new ApiError(403, "Insufficient permission"));
  }
  return next();
};
