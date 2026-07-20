import { ApiError } from "../utils/ApiError.js";
import { verifyAccessToken } from "../utils/token.js";

export function authenticate(request, _response, next) {
  const authorization = request.headers.authorization;
  const bearerMatch = typeof authorization === "string"
    ? authorization.match(/^Bearer ([^\s]+)$/)
    : null;
  const token = bearerMatch?.[1];

  if (!token) {
    return next(new ApiError(401, "Authentication required"));
  }

  try {
    const payload = verifyAccessToken(token);
    request.user = {
      userId: payload.userId,
      role: payload.role,
      adminLevel: payload.adminLevel ?? null,
      branchId: payload.branchId ?? null,
    };
    return next();
  } catch {
    return next(new ApiError(401, "Invalid or expired access token"));
  }
}

export const authorizeRoles = (...roles) => (request, _response, next) => {
  if (!request.user || !roles.includes(request.user.role)) {
    return next(new ApiError(403, "Insufficient permission"));
  }
  return next();
};
