import { authService } from "../services/auth.service.js";
import { env } from "../config/env.js";
import { sendSuccess } from "../utils/response.js";
import { getRefreshCookieOptions } from "../utils/token.js";

export async function login(request, response) {
  const { refreshToken, data } = await authService.login({
    ...request.body,
    userAgent: request.get("user-agent") ?? null,
    ipAddress: request.ip ?? null,
  });

  response.cookie(env.refreshCookieName, refreshToken, getRefreshCookieOptions());

  return sendSuccess(response, {
    message: "Login successful.",
    data,
  });
}

export async function registerCustomer(request, response) {
  const data = await authService.registerCustomer(request.body);

  return sendSuccess(response, {
    statusCode: 201,
    message: "Registration successful. Please verify your email.",
    data,
  });
}

export async function verifyEmail(request, response) {
  const data = await authService.verifyEmail(request.body);

  return sendSuccess(response, {
    message: "Email verified successfully.",
    data,
  });
}

export async function resendVerificationOtp(request, response) {
  const data = await authService.resendVerificationOtp(request.body);

  return sendSuccess(response, {
    message: "A new verification OTP has been generated.",
    data,
  });
}
