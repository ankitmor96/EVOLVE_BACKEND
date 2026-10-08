import "dotenv/config";

import { Temporal } from "@js-temporal/polyfill";

if (!("Temporal" in globalThis)) {
  Object.defineProperty(globalThis, "Temporal", {
    value: Temporal,
    writable: true,
    configurable: true,
  });
}

import postgres from "@prisma/orm-postgres/runtime";
import contractJson from "./contract.json";

const db = postgres({
  contractJson,
  url: process.env.DATABASE_URL!,
});

async function main() {
  await db.connect();

  const email = "YOUR_ADMIN_EMAIL@gmail.com";

  const user = await db.orm.public.User
    .where({ email })
    .first();

  if (!user) {
    throw new Error(`User not found: ${email}`);
  }

  await db.orm.public.User
    .where({ email })
    .update({
      role: "ADMIN",
    });

  console.log(`✅ ${email} is now ADMIN`);
}

main()
  .catch((error) => {
    console.error("❌ Failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.close();
  });