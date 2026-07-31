import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "demo@openvts.io" },
    update: {},
    create: { name: "Demo Workspace", email: "demo@openvts.io", emailVerified: new Date() },
  });
  await prisma.project.upsert({
    where: { androidPackageName: "com.northstar.fleet" },
    update: {},
    create: {
      ownerId: user.id,
      name: "Northstar Fleet",
      slug: "northstar-fleet",
      description: "Field operations application for Northstar Logistics.",
      androidApplicationName: "Northstar Fleet",
      iosApplicationName: "Northstar Fleet",
      androidPackageName: "com.northstar.fleet",
      iosBundleId: "com.northstar.fleet",
      status: "READY",
    },
  });
}

main().finally(() => prisma.$disconnect());
