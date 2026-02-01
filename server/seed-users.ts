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
  // Check if any users exist - if so, seeding already happened
  const existingUsers = await db.select().from(users).limit(1);
  
  if (existingUsers.length > 0) {
    console.log("[Seed] Users already exist, skipping seed");
    return;
  }
  
  console.log("[Seed] No users found, creating initial users...");

  for (const seedUser of SEED_USERS) {
    await db.insert(users).values(seedUser);
    console.log(`[Seed] Created user: ${seedUser.email} (${seedUser.role})`);
  }

  console.log("[Seed] User seeding complete - this will not run again");
}
