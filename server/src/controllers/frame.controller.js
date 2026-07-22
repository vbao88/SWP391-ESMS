import { frameService } from "../services/frame.service.js";
import { sendSuccess } from "../utils/response.js";

export async function listPublicFrames(request, response) {
  const data = await frameService.listPublicFrames(request.validatedQuery);
  return sendSuccess(response, {
    message: "Frames retrieved successfully.",
    data,
  });
}

export async function getPublicFrameDetail(request, response) {
  const data = await frameService.getPublicFrameDetail(request.params.frameId);
  return sendSuccess(response, {
    message: "Frame retrieved successfully.",
    data,
  });
}
