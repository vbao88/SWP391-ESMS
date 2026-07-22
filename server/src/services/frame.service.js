import mongoose from "mongoose";
import { Frame } from "../models/Frame.js";
import { ApiError } from "../utils/ApiError.js";

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSort({ sort, order }) {
  const direction = order === "desc" ? -1 : 1;
  if (sort === "price") return { priceFrom: direction, normalizedName: 1, _id: 1 };
  if (sort === "createdAt") return { createdAt: direction, _id: 1 };
  return { normalizedName: direction, _id: 1 };
}

function buildFilters(query) {
  const filters = [];
  if (query.brandId) filters.push({ "brand._id": { $in: query.brandId.map((id) => new mongoose.Types.ObjectId(id)) } });
  if (query.categoryId) filters.push({ "category._id": { $in: query.categoryId.map((id) => new mongoose.Types.ObjectId(id)) } });
  for (const field of ["shape", "material", "gender"]) {
    if (query[field]) filters.push({ [field]: { $in: query[field] } });
  }
  if (query.faceShape) filters.push({ faceShapes: { $in: query.faceShape } });
  if (query.color) filters.push({ "activeVariants.colorNormalized": { $in: query.color } });
  if (query.minPrice !== undefined) filters.push({ priceFrom: { $gte: query.minPrice } });
  if (query.maxPrice !== undefined) filters.push({ priceFrom: { $lte: query.maxPrice } });
  return filters;
}

function primaryImageExpression() {
  return {
    $cond: [
      { $eq: [{ $size: "$images" }, 0] },
      null,
      {
        $let: {
          vars: {
            primaryImages: { $filter: { input: "$images", as: "image", cond: "$$image.isPrimary" } },
          },
          in: {
            $let: {
              vars: {
                selected: {
                  $cond: [
                    { $gt: [{ $size: "$$primaryImages" }, 0] },
                    { $arrayElemAt: ["$$primaryImages", 0] },
                    { $reduce: { input: "$images", initialValue: { $arrayElemAt: ["$images", 0] }, in: { $cond: [{ $lt: ["$$this.sortOrder", "$$value.sortOrder"] }, "$$this", "$$value"] } } },
                  ],
                },
              },
              in: { url: "$$selected.url", altText: "$$selected.altText" },
            },
          },
        },
      },
    ],
  };
}

async function listPublicFrames(query) {
  const pageOffset = (query.page - 1) * query.pageSize;
  const filters = buildFilters(query);
  const search = query.search ? new RegExp(escapeRegex(query.search), "i") : null;

  const pipeline = [
    { $match: { status: "active" } },
    { $lookup: { from: "brands", let: { id: "$brandId" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$_id", "$$id"] }, { $eq: ["$status", "active"] }] } } }, { $project: { name: 1 } }], as: "brand" } },
    { $unwind: "$brand" },
    { $lookup: { from: "categories", let: { id: "$categoryId" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$_id", "$$id"] }, { $eq: ["$status", "active"] }] } } }, { $project: { name: 1 } }], as: "category" } },
    { $unwind: "$category" },
    { $lookup: { from: "framevariants", let: { id: "$_id" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$frameId", "$$id"] }, { $eq: ["$status", "active"] }] } } }, { $project: { sku: 1, colorNormalized: 1, price: 1 } }], as: "activeVariants" } },
    { $match: { "activeVariants.0": { $exists: true } } },
    { $set: { priceFrom: { $min: "$activeVariants.price" }, normalizedName: { $toLower: "$name" } } },
  ];
  if (search) pipeline.push({ $match: { $or: [{ name: search }, { "brand.name": search }, { "activeVariants.sku": search }] } });
  if (filters.length) pipeline.push({ $match: { $and: filters } });
  pipeline.push({
    $facet: {
      items: [
        { $sort: buildSort(query) },
        { $skip: pageOffset },
        { $limit: query.pageSize },
        { $project: { _id: 0, id: { $toString: "$_id" }, name: 1, brand: { id: { $toString: "$brand._id" }, name: "$brand.name" }, category: { id: { $toString: "$category._id" }, name: "$category.name" }, shape: 1, material: 1, gender: 1, faceShapes: 1, primaryImage: primaryImageExpression(), priceFrom: 1 } },
      ],
      metadata: [{ $count: "totalItems" }],
    },
  });

  const [result] = await Frame.aggregate(pipeline);
  const totalItems = result.metadata[0]?.totalItems ?? 0;
  return { items: result.items, pagination: { page: query.page, pageSize: query.pageSize, totalItems, totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize) } };
}

function orderedMedia(images) {
  return images
    .map((image, storedIndex) => ({ image, storedIndex }))
    .sort((left, right) => left.image.sortOrder - right.image.sortOrder || left.storedIndex - right.storedIndex)
    .map(({ image }) => ({
      url: image.url,
      altText: image.altText,
      sortOrder: image.sortOrder,
      isPrimary: image.isPrimary,
    }));
}

function selectedPrimaryImage(images) {
  const selected = images.find(({ isPrimary }) => isPrimary) ?? images[0];
  return selected ? { url: selected.url, altText: selected.altText } : null;
}

function publicMediaProjection(input) {
  return {
    $map: {
      input,
      as: "image",
      in: {
        url: "$$image.url",
        altText: "$$image.altText",
        sortOrder: "$$image.sortOrder",
        isPrimary: "$$image.isPrimary",
      },
    },
  };
}

async function getPublicFrameDetail(frameId) {
  const [frame] = await Frame.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(frameId), status: "active" } },
    {
      $lookup: {
        from: "brands",
        let: { id: "$brandId" },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ["$_id", "$$id"] }, { $eq: ["$status", "active"] }] } } },
          { $project: { name: 1 } },
        ],
        as: "brand",
      },
    },
    { $unwind: "$brand" },
    {
      $lookup: {
        from: "categories",
        let: { id: "$categoryId" },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ["$_id", "$$id"] }, { $eq: ["$status", "active"] }] } } },
          { $project: { name: 1 } },
        ],
        as: "category",
      },
    },
    { $unwind: "$category" },
    {
      $lookup: {
        from: "framevariants",
        let: { id: "$_id" },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ["$frameId", "$$id"] }, { $eq: ["$status", "active"] }] } } },
          { $sort: { color: 1, size: 1, sku: 1, _id: 1 } },
          {
            $project: {
              _id: 1,
              sku: 1,
              color: 1,
              size: 1,
              price: 1,
              images: publicMediaProjection("$images"),
            },
          },
        ],
        as: "variants",
      },
    },
    { $match: { "variants.0": { $exists: true } } },
    {
      $project: {
        _id: 1,
        name: 1,
        description: 1,
        brand: { _id: "$brand._id", name: "$brand.name" },
        category: { _id: "$category._id", name: "$category.name" },
        shape: 1,
        material: 1,
        gender: 1,
        faceShapes: 1,
        images: publicMediaProjection("$images"),
        variants: 1,
      },
    },
  ]);

  if (!frame) throw new ApiError(404, "Frame not found");

  const images = orderedMedia(frame.images);
  const framePrimaryImage = selectedPrimaryImage(images);
  const variants = frame.variants.map((variant) => {
    const variantImages = orderedMedia(variant.images);
    return {
      id: variant._id.toString(),
      sku: variant.sku,
      color: variant.color,
      size: variant.size,
      price: variant.price,
      images: variantImages,
      primaryImage: selectedPrimaryImage(variantImages) ?? framePrimaryImage,
    };
  });

  return {
    id: frame._id.toString(),
    name: frame.name,
    brand: { id: frame.brand._id.toString(), name: frame.brand.name },
    category: { id: frame.category._id.toString(), name: frame.category.name },
    shape: frame.shape,
    material: frame.material,
    gender: frame.gender,
    faceShapes: frame.faceShapes,
    primaryImage: framePrimaryImage,
    priceFrom: Math.min(...variants.map(({ price }) => price)),
    description: frame.description,
    images,
    variants,
  };
}

export const frameService = Object.freeze({ listPublicFrames, getPublicFrameDetail });
