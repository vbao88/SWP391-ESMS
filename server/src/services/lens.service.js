import mongoose from "mongoose";
import { Lens } from "../models/Lens.js";

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSearchRegex(value) {
  return new RegExp(value.split(" ").map(escapeRegex).join("\\s+"), "i");
}

function buildSort({ sort, order }) {
  const direction = order === "desc" ? -1 : 1;
  if (sort === "price") return { basePrice: direction, normalizedName: 1, _id: 1 };
  if (sort === "createdAt") return { createdAt: direction, _id: 1 };
  return { normalizedName: direction, _id: 1 };
}

function buildFilters(query) {
  const filters = [];
  if (query.brandId) filters.push({ "brand._id": { $in: query.brandId.map((id) => new mongoose.Types.ObjectId(id)) } });
  if (query.visionType) filters.push({ visionType: { $in: query.visionType } });
  if (query.refractiveIndex) filters.push({ refractiveIndex: { $in: query.refractiveIndex } });
  if (query.feature) filters.push({ features: { $in: query.feature } });
  if (query.minPrice !== undefined) filters.push({ basePrice: { $gte: query.minPrice } });
  if (query.maxPrice !== undefined) filters.push({ basePrice: { $lte: query.maxPrice } });
  return filters;
}

function primaryImageExpression() {
  return {
    $cond: [
      { $eq: [{ $size: "$images" }, 0] },
      null,
      {
        $let: {
          vars: { primaryImages: { $filter: { input: "$images", as: "image", cond: "$$image.isPrimary" } } },
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

async function listPublicLenses(query) {
  const pageOffset = (query.page - 1) * query.pageSize;
  const filters = buildFilters(query);
  const search = query.search ? buildSearchRegex(query.search) : null;
  const pipeline = [
    { $match: { status: "active" } },
    { $lookup: { from: "brands", let: { id: "$brandId" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$_id", "$$id"] }, { $eq: ["$status", "active"] }] } } }, { $project: { name: 1 } }], as: "brand" } },
    { $unwind: "$brand" },
    { $set: { normalizedName: { $toLower: "$name" } } },
  ];
  if (search) pipeline.push({ $match: { $or: [{ name: search }, { "brand.name": search }] } });
  if (filters.length) pipeline.push({ $match: { $and: filters } });
  pipeline.push({
    $facet: {
      items: [
        { $sort: buildSort(query) },
        { $skip: pageOffset },
        { $limit: query.pageSize },
        { $project: { _id: 0, id: { $toString: "$_id" }, name: 1, description: 1, brand: { id: { $toString: "$brand._id" }, name: "$brand.name" }, visionType: 1, refractiveIndex: 1, features: 1, basePrice: 1, primaryImage: primaryImageExpression() } },
      ],
      metadata: [{ $count: "totalItems" }],
    },
  });
  const [result] = await Lens.aggregate(pipeline);
  const totalItems = result.metadata[0]?.totalItems ?? 0;
  return { items: result.items, pagination: { page: query.page, pageSize: query.pageSize, totalItems, totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize) } };
}

export const lensService = Object.freeze({ listPublicLenses });
