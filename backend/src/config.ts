import { ServerConfig, ServerConfigSchema } from "./services/server";
import { createValidator } from "./utils/validations";
import z from "zod";
import { DatabaseConfigSchema } from "./services/database";

export const SystemEnvSchema = z.object({
  ...ServerConfigSchema.shape,
  ...DatabaseConfigSchema.shape,
});

export type SystemConfig = z.infer<typeof SystemEnvSchema>;

export const validateSystemEnv = createValidator(SystemEnvSchema);

export const createServerConfig = (env: NodeJS.ProcessEnv): SystemConfig => {
  const validated = validateSystemEnv(env);

  return {
    PORT: validated.PORT,
    DATABASE_URL: validated.DATABASE_URL
  }
};

