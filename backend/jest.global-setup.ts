import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import {DATABASE_URL} from './src/services/__tests__/database'

export default async () => {
  const dbServerUrl = DATABASE_URL.replace(/\/[^/]+$/, '');
  const testDbName = DATABASE_URL.split('/').reverse()[0];
  
  // Connect to server without a database
  const client = new PrismaClient({
    adapter: new PrismaMariaDb(dbServerUrl),
  });

  console.log(`Creating test database ${testDbName} if it doesn't exist...`);
  await client.$executeRawUnsafe(`CREATE DATABASE IF NOT EXISTS \`${testDbName}\`;`);
  await client.$disconnect();
};