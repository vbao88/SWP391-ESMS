import { Branch } from "../models/Branch.js";
import { ApiError } from "../utils/ApiError.js";

function toPublicBranch(branch) {
  return {
    id: branch._id.toString(),
    code: branch.code,
    name: branch.name,
    district: branch.district,
    city: branch.city,
    address: branch.address,
    phone: branch.phone,
    eyeExamEnabled: branch.eyeExamEnabled,
    operatingHours: {
      open: branch.operatingHours.open,
      close: branch.operatingHours.close,
    },
  };
}

function toAdminBranch(branch) {
  return {
    ...toPublicBranch(branch),
    status: branch.status,
    createdAt: branch.createdAt.toISOString(),
    updatedAt: branch.updatedAt.toISOString(),
  };
}

function buildCreatePayload(input) {
  const payload = {
    code: input.code,
    name: input.name,
    district: input.district,
    address: input.address,
  };

  for (const field of ["city", "phone", "eyeExamEnabled"]) {
    if (input[field] !== undefined) payload[field] = input[field];
  }

  if (input.operatingHours !== undefined) {
    payload.operatingHours = {
      open: input.operatingHours.open ?? "09:00",
      close: input.operatingHours.close ?? "21:00",
    };
  }

  return payload;
}

function isBranchCodeDuplicate(error) {
  return (
    error?.code === 11000 &&
    (error?.keyPattern?.code === 1 ||
      Object.hasOwn(error?.keyValue ?? {}, "code") ||
      /code_1/.test(error?.message ?? ""))
  );
}

function buildUpdatePayload(input, currentBranch) {
  const update = {};

  for (const field of ["name", "district", "city", "address", "phone", "eyeExamEnabled"]) {
    if (input[field] !== undefined) update[field] = input[field];
  }

  if (input.operatingHours !== undefined) {
    update.operatingHours = {
      open: input.operatingHours.open ?? currentBranch.operatingHours.open,
      close: input.operatingHours.close ?? currentBranch.operatingHours.close,
    };
  }

  return update;
}

function assertValidOperatingHours(operatingHours) {
  if (!operatingHours) return;

  const [openHours, openMinutes] = operatingHours.open.split(":").map(Number);
  const [closeHours, closeMinutes] = operatingHours.close.split(":").map(Number);
  const open = openHours * 60 + openMinutes;
  const close = closeHours * 60 + closeMinutes;

  if (open >= close) {
    throw new ApiError(400, "Validation failed", [
      "operatingHours.open must be earlier than close",
    ]);
  }
}

async function createBranch(input) {
  try {
    const branch = await Branch.create(buildCreatePayload(input));
    return toAdminBranch(branch);
  } catch (error) {
    if (isBranchCodeDuplicate(error)) {
      throw new ApiError(409, "Branch code already exists");
    }
    throw error;
  }
}

async function updateBranch(branchId, input) {
  const currentBranch = await Branch.findById(branchId);

  if (!currentBranch) {
    throw new ApiError(404, "Branch not found");
  }

  const update = buildUpdatePayload(input, currentBranch);
  assertValidOperatingHours(update.operatingHours);

  const updatedBranch = await Branch.findByIdAndUpdate(branchId, update, {
    returnDocument: "after",
    runValidators: true,
  });

  if (!updatedBranch) {
    throw new ApiError(404, "Branch not found");
  }

  return toAdminBranch(updatedBranch);
}

async function updateBranchStatus(branchId, status) {
  const currentBranch = await Branch.findById(branchId);

  if (!currentBranch) {
    throw new ApiError(404, "Branch not found");
  }

  if (currentBranch.status === status) {
    return toAdminBranch(currentBranch);
  }

  const updatedBranch = await Branch.findByIdAndUpdate(
    branchId,
    { status },
    { returnDocument: "after", runValidators: true },
  );

  if (!updatedBranch) {
    throw new ApiError(404, "Branch not found");
  }

  return toAdminBranch(updatedBranch);
}

async function listPublicBranches() {
  const branches = await Branch.find({ status: "active" }).sort({ code: 1 });
  return branches.map(toPublicBranch);
}

async function getPublicBranch(branchId) {
  const branch = await Branch.findOne({ _id: branchId, status: "active" });

  if (!branch) {
    throw new ApiError(404, "Branch not found");
  }

  return toPublicBranch(branch);
}

export const branchService = Object.freeze({
  createBranch,
  getPublicBranch,
  listPublicBranches,
  updateBranch,
  updateBranchStatus,
});
