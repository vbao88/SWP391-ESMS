import { brandService } from "../services/brand.service.js";
import { sendSuccess } from "../utils/response.js";

export async function createBrand(request, response) {
  return sendSuccess(response, {
    statusCode: 201,
    message: "Brand created successfully.",
    data: await brandService.createBrand(request.body),
  });
}

export async function updateBrand(request, response) {
  return sendSuccess(response, {
    message: "Brand updated successfully.",
    data: await brandService.updateBrand(request.params.brandId, request.body),
  });
}

export async function updateBrandStatus(request, response) {
  return sendSuccess(response, {
    message: "Brand status updated successfully.",
    data: await brandService.updateBrandStatus(request.params.brandId, request.body.status),
  });
}
