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
    /**
     * Proxies propios delante de la app (Caddy, el del hosting) que agregan la IP del cliente a X-Forwarded-For.
     * Sin definir: 1 en producción, 0 en local. Con 0 no se confía en X-Forwarded-For (lo escribe el cliente).
     */
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).optional(),
    /** Remitente de los correos a clientes, p. ej. "Tienda <pedidos@dominio.cl>". */
    MAIL_FROM: z.string().min(3).default("Tienda <pedidos@localhost>"),
    /** Clave de Resend (servidor). Sin ella: en local los correos se muestran en la consola; en producción esperan en cola. */
    RESEND_API_KEY: z.string().min(10).optional(),
    /**
     * Mercado Pago (Checkout Pro), solo en el servidor: access token y clave secreta de las notificaciones (Tus
     * integraciones → Webhooks). Sin ambos, el método queda sin configurar. En producción no se aceptan tokens TEST-.
     */
    MERCADOPAGO_ACCESS_TOKEN: z.string().min(20).optional(),
    MERCADOPAGO_WEBHOOK_SECRET: z.string().min(16).optional(),
  })
  .transform((e) => {
    const APP_ENV = e.APP_ENV ?? (e.NODE_ENV === "production" ? "production" : "local");
    return { ...e, APP_ENV, TRUSTED_PROXY_HOPS: e.TRUSTED_PROXY_HOPS ?? (APP_ENV === "production" ? 1 : 0) };
  })
  // Las URLs de retorno de las pasarelas salen de APP_URL: en producción tiene que ser HTTPS.
  .refine((e) => e.APP_ENV !== "production" || e.APP_URL.startsWith("https://"), { path: ["APP_URL"], message: "En producción APP_URL debe usar https://" });

export const env = schema.parse(process.env);
export type AppEnv = (typeof env)["APP_ENV"];
