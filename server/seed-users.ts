import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

const SEED_USERS = [
  {
    id: "9833f41d-8d0d-4814-9dfd-84f7fbbaaf35",
    email: "warnergears@gmail.com",
    password: "$2b$10$7A150U50/abLBHzJCcvvse135Z1WHUtLzf2s.tMMKJzGCmN7SX5Na",
    role: "admin" as const,
    status: "approved" as const,
    businessName: "Warner Gears Admin",
    zohoIsActive: true,
    emailOptIn: true,
  },
  {
    id: "8b393e9e-cd9a-4a59-9804-94c99bd13145",
    email: "staff@warnergears.com",
    password: "$2b$10$i68lgbTpRXiI.dGuxnPFJ.4bM/yw0NuYqh3mkcDfMbku3zM9u.Z0i",
    role: "staff" as const,
    status: "approved" as const,
    businessName: "Warner Gears Staff",
    zohoIsActive: true,
    emailOptIn: true,
  },
  {
    id: "d29a685d-2714-4dd6-9251-ff0b9bec089f",
    email: "customer@warnergears.com",
    password: "$2b$10$jDKhrchagpLaIwy.l4otfe.5IWZzoaVRtoHZiY/FK5DiOhCpg/Wb2",
    role: "customer" as const,
    status: "approved" as const,
    businessName: "Warner Gears Customer",
    zohoIsActive: true,
    emailOptIn: true,
  },
];

export async function seedUsers(): Promise<void> {
  // Only run seeding when explicitly enabled via environment variable
  if (process.env.SEED_DEFAULT_USERS !== "true") {
    console.log("[Seed] Skipping (set SEED_DEFAULT_USERS=true to enable)");
    return;
  }
  
  console.log("[Seed] Checking for seed users...");

  for (const seedUser of SEED_USERS) {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, seedUser.email))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(users).values(seedUser);
      console.log(`[Seed] Created user: ${seedUser.email} (${seedUser.role})`);
    } else {
      console.log(`[Seed] User exists: ${seedUser.email}`);
    }
  }

  console.log("[Seed] User seeding complete");
}
