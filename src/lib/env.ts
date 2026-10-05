import { z } from "zod";

/** Toda la configuración externa pasa por aquí y se valida al arrancar. Ver .env.example. */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  RESERVATION_TTL_MINUTES: z.coerce.number().int().positive().default(30),
});

export const env = schema.parse(process.env);
