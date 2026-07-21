import { branchService } from "../services/branch.service.js";
import { sendSuccess } from "../utils/response.js";

export async function listPublicBranches(_request, response) {
  const data = await branchService.listPublicBranches();

  return sendSuccess(response, {
    message: "Branches retrieved successfully.",
    data,
  });
}

export async function getPublicBranch(request, response) {
  const data = await branchService.getPublicBranch(request.params.branchId);

  return sendSuccess(response, {
    message: "Branch retrieved successfully.",
    data,
  });
}

export async function createBranch(request, response) {
  const data = await branchService.createBranch(request.body);

  return sendSuccess(response, {
    statusCode: 201,
    message: "Branch created successfully.",
    data,
  });
}

export async function updateBranch(request, response) {
  const data = await branchService.updateBranch(request.params.branchId, request.body);

  return sendSuccess(response, {
    message: "Branch updated successfully.",
    data,
  });
}

export async function updateBranchStatus(request, response) {
  const data = await branchService.updateBranchStatus(
    request.params.branchId,
    request.body.status,
  );

  return sendSuccess(response, {
    message: "Branch status updated successfully.",
    data,
  });
}
