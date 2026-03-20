import { createSystemConfig } from "../../config";
import { createDBClient } from "../database";

const testConfig = createSystemConfig(process.env);
testConfig.db.DATABASE_URL = testConfig.db.DATABASE_URL + '_test';

export const getTestDB = () => createDBClient(testConfig.db);