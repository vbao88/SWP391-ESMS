import { Brand } from "../models/Brand.js";
import { ApiError } from "../utils/ApiError.js";

const NAME_COLLATION = { locale: "en", strength: 2 };

function toAdminBrand(brand) {
  return {
    id: brand._id.toString(),
    name: brand.name,
    status: brand.status,
    createdAt: brand.createdAt.toISOString(),
    updatedAt: brand.updatedAt.toISOString(),
  };
}

function isBrandNameDuplicate(error) {
  return (
    error?.code === 11000 &&
    (error?.keyPattern?.name === 1 ||
      Object.hasOwn(error?.keyValue ?? {}, "name") ||
      /name_1/.test(error?.message ?? ""))
  );
}

async function findNameDuplicate(name, excludedBrandId) {
  const filter = { name };
  if (excludedBrandId) filter._id = { $ne: excludedBrandId };
  return Brand.findOne(filter, "_id").collation(NAME_COLLATION).lean();
}

async function createBrand(input) {
  if (await findNameDuplicate(input.name)) {
    throw new ApiError(409, "Brand name already exists");
  }

  try {
    return toAdminBrand(await Brand.create({ name: input.name }));
  } catch (error) {
    if (isBrandNameDuplicate(error)) {
      throw new ApiError(409, "Brand name already exists");
    }
    throw error;
  }
}

async function updateBrand(brandId, input) {
  const brand = await Brand.findById(brandId);
  if (!brand) throw new ApiError(404, "Brand not found");

  if (await findNameDuplicate(input.name, brand._id)) {
    throw new ApiError(409, "Brand name already exists");
  }

  brand.name = input.name;
  try {
    return toAdminBrand(await brand.save());
  } catch (error) {
    if (isBrandNameDuplicate(error)) {
      throw new ApiError(409, "Brand name already exists");
    }
    throw error;
  }
}

async function updateBrandStatus(brandId, status) {
  const brand = await Brand.findById(brandId);
  if (!brand) throw new ApiError(404, "Brand not found");

  if (brand.status === status) return toAdminBrand(brand);

  brand.status = status;
  return toAdminBrand(await brand.save());
}

export const brandService = Object.freeze({ createBrand, updateBrand, updateBrandStatus });
