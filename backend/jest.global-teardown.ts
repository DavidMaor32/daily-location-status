import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

export default async () => {
  const TEST_DB_NAME = 'myapp_test';
  const mainUrlWithoutDB = process.env.DATABASE_URL!.replace(/\/[^/]+$/, '');

  const client = new PrismaClient({
    adapter: new PrismaMariaDb(mainUrlWithoutDB),
  });

  console.log(`Dropping test database ${TEST_DB_NAME}...`);
  await client.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${TEST_DB_NAME}\`;`);
  await client.$disconnect();
};