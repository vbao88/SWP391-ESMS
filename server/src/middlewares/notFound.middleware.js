import { ApiError } from "../utils/ApiError.js";

export function notFoundHandler(request, _response, next) {
  next(new ApiError(404, `Route not found: ${request.method} ${request.originalUrl}`));
}
