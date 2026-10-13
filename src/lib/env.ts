import { z } from "zod";

/** Toda la configuración externa pasa por aquí y se valida al arrancar. Ver .env.example. */
const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /**
     * Ambiente de la aplicación, independiente de NODE_ENV (una build local puede correr como production).
     * Sin definir: "production" si NODE_ENV=production; si no, "local". Lo de prueba (pago simulado,
     * datos bancarios de ejemplo) solo existe en local y test.
     */
    APP_ENV: z.enum(["local", "test", "integration", "production"]).optional(),
    DATABASE_URL: z.string().url(),
    APP_URL: z.string().url().default("http://localhost:3000"),
    SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
    RESERVATION_TTL_MINUTES: z.coerce.number().int().positive().default(30),
    /** Plazo de reserva de un pedido pagado por transferencia (minutos). Sin definir: RESERVATION_TTL_MINUTES. */
    TRANSFER_RESERVATION_MINUTES: z.coerce.number().int().min(5).max(4320).optional(),
    /** "on" habilita el proveedor de pago simulado; solo tiene efecto con APP_ENV local o test. */
    PAYMENT_SIMULATION: z.enum(["on", "off"]).default("off"),
    /** Carpeta de imágenes subidas desde el panel (almacenamiento local). */
    UPLOAD_DIR: z.string().min(1).default("./uploads"),
  })
  .transform((e) => ({ ...e, APP_ENV: e.APP_ENV ?? (e.NODE_ENV === "production" ? "production" : "local") }))
  // Las URLs de retorno de las pasarelas salen de APP_URL: en producción tiene que ser HTTPS.
  .refine((e) => e.APP_ENV !== "production" || e.APP_URL.startsWith("https://"), { path: ["APP_URL"], message: "En producción APP_URL debe usar https://" });

export const env = schema.parse(process.env);
export type AppEnv = (typeof env)["APP_ENV"];
