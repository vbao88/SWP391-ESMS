import { lensService } from "../services/lens.service.js";
import { sendSuccess } from "../utils/response.js";

export async function listPublicLenses(request, response) {
  const data = await lensService.listPublicLenses(request.validatedQuery);
  return sendSuccess(response, {
    message: "Lenses retrieved successfully.",
    data,
  });
}
