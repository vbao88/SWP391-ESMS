import { env } from "../config/env.js";

export function errorHandler(error, _request, response, _next) {
  const statusCode = error.statusCode ?? 500;

  const payload = {
    success: false,
    message: statusCode === 500 ? "Internal server error" : error.message,
    details: error.details ?? null,
  };

  if (env.nodeEnv !== "production") {
    payload.stack = error.stack;
  }

  return response.status(statusCode).json(payload);
}
