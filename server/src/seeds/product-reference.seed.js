import { Brand } from "../models/Brand.js";
import { Category } from "../models/Category.js";

export const productReferenceSeedData = Object.freeze({
  brands: Object.freeze([
    Object.freeze({ name: "Ray-Ban" }),
    Object.freeze({ name: "Oakley" }),
  ]),
  categories: Object.freeze([
    Object.freeze({ name: "Eyeglasses" }),
    Object.freeze({ name: "Sunglasses" }),
    Object.freeze({ name: "Blue Light Glasses" }),
  ]),
});

async function seedCollection(Model, records) {
  for (const record of records) {
    await Model.findOneAndUpdate(
      { name: record.name },
      { $setOnInsert: record },
      {
        upsert: true,
        returnDocument: "after",
        setDefaultsOnInsert: true,
        collation: { locale: "en", strength: 2 },
      },
    );
  }
}

async function validateSeedRecords(Model, records, label) {
  if (!Array.isArray(records)) {
    throw new TypeError(`${label} seed data must be an array`);
  }

  await Promise.all(records.map((record) => new Model(record).validate()));
}

export async function seedProductReferences(seedData = productReferenceSeedData) {
  if (!seedData || typeof seedData !== "object") {
    throw new TypeError("Product reference seed data must be an object");
  }

  await Promise.all([
    validateSeedRecords(Brand, seedData.brands, "Brand"),
    validateSeedRecords(Category, seedData.categories, "Category"),
  ]);

  await seedCollection(Brand, seedData.brands);
  await seedCollection(Category, seedData.categories);
}
