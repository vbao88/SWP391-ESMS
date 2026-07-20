import { authService } from "../services/auth.service.js";
import { env } from "../config/env.js";
import { sendSuccess } from "../utils/response.js";
import {
  getClearRefreshCookieOptions,
  getRefreshCookieOptions,
} from "../utils/token.js";

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

export async function refreshSession(request, response) {
  try {
    const { accessToken, expiresIn, newRefreshToken } = await authService.refreshSession({
      refreshToken: request.cookies?.[env.refreshCookieName],
      userAgent: request.get("user-agent") ?? null,
      ipAddress: request.ip ?? null,
    });

    response.cookie(env.refreshCookieName, newRefreshToken, getRefreshCookieOptions());

    return sendSuccess(response, {
      message: "Token refreshed successfully.",
      data: { accessToken, expiresIn },
    });
  } catch (error) {
    if (error instanceof Error && error.statusCode === 401) {
      response.clearCookie(env.refreshCookieName, getClearRefreshCookieOptions());
    }

    throw error;
  }
}

export async function logoutSession(request, response) {
  try {
    await authService.logoutSession({
      refreshToken: request.cookies?.[env.refreshCookieName],
    });
  } finally {
    response.clearCookie(env.refreshCookieName, getClearRefreshCookieOptions());
  }

  return sendSuccess(response, {
    message: "Logout successful.",
    data: null,
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
