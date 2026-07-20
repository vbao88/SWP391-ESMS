export function sendSuccess(response, { statusCode = 200, message, data = null }) {
  return response.status(statusCode).json({
    success: true,
    message,
    data,
  });
}
