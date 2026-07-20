import { authService } from "../services/auth.service.js";
import { sendSuccess } from "../utils/response.js";

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
