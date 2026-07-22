import bcrypt from "bcryptjs";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { Branch } from "../models/Branch.js";
import { User } from "../models/User.js";
import { seedProductReferences } from "./product-reference.seed.js";

const branches = [
  {
    code: "CG",
    name: "Lensora Optical – Cầu Giấy",
    district: "Cầu Giấy",
    address: "Cầu Giấy, Hà Nội",
  },
  {
    code: "DD",
    name: "Lensora Optical – Đống Đa",
    district: "Đống Đa",
    address: "Đống Đa, Hà Nội",
  },
  {
    code: "HD",
    name: "Lensora Optical – Hà Đông",
    district: "Hà Đông",
    address: "Hà Đông, Hà Nội",
  },
];

async function seed() {
  await connectDatabase();

  for (const branch of branches) {
    await Branch.findOneAndUpdate(
      { code: branch.code },
      { $set: branch },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  await seedProductReferences();

  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (email && password) {
    const passwordHash = await bcrypt.hash(password, 12);
    await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      {
        $set: {
          fullName: "ESMS Super Administrator",
          passwordHash,
          role: "administrator",
          adminLevel: "super_admin",
          status: "active",
          emailVerifiedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    console.log(`Seeded Super Administrator: ${email}`);
  } else {
    console.log("Skipped Super Administrator seed. Configure SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD when needed.");
  }

  console.log("Seeded three Lensora Optical branches.");
  await disconnectDatabase();
}

seed().catch(async (error) => {
  console.error("Seed failed:", error);
  await disconnectDatabase();
  process.exit(1);
});
