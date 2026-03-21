import { createSystemConfig } from "../../config";
import { createDBClient } from "../database";

const testConfig = createSystemConfig(process.env).db;
testConfig.DATABASE_URL = testConfig.DATABASE_URL + '_test';

export const DATABASE_URL = process.env.DATABASE_URL!;

const lastSlashIndex = DATABASE_URL.lastIndexOf('/');
export const dbServerUrl = DATABASE_URL.slice(0, lastSlashIndex);
export const testDbName = DATABASE_URL.slice(lastSlashIndex + 1);

export const testDBClient  = createDBClient(testConfig);