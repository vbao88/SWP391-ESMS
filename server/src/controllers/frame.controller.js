import { frameService } from "../services/frame.service.js";
import { sendSuccess } from "../utils/response.js";

export async function listPublicFrames(request, response) {
  const data = await frameService.listPublicFrames(request.validatedQuery);
  return sendSuccess(response, {
    message: "Frames retrieved successfully.",
    data,
  });
}
