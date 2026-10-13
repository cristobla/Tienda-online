import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import * as s from "@/db/schema";
import { clientIp } from "@/lib/client-ip";
import { UserError } from "@/lib/form";
import { createStaffUser, newUserSchema } from "@/modules/auth/users";
import { addToCart, getCart } from "@/modules/cart";
import { productFeedXml, validGtin } from "@/modules/catalog/feed";
import { type Deliver, sendPendingEmails } from "@/modules/mail";
import { changeOrderStatus } from "@/modules/orders";
import { confirmTransfer, MAX_PENDING_PER_EMAIL, placeOrder, transferConfirmationSchema } from "@/modules/payments";
import { makeCommune, makeVariant, resetDb } from "./helpers";

let adminId: string;
let communeId: number;

beforeEach(async () => {
  await resetDb();
  const [u] = await db.insert(s.users).values({ email: "admin@test.cl", passwordHash: "x", role: "ADMIN" }).returning();
  adminId = u!.id;
  communeId = (await makeCommune("T9", 0)).communeId;
});

async function order(variantId: string, email = "cliente@test.cl") {
  const cart = await addToCart(null, { variantId, quantity: 1 });
  const input = { email, firstName: "Ana", lastName: "Pérez", phone: "+56912345678", rut: null, communeId, street: "Calle", number: "1", apartment: null, notes: null };
  return placeOrder(cart, { ...input, expectedTotal: (await getCart(cart)).subtotal }, "transferencia");
}
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
const confirm = async (orderId: string) => {
  const [p] = await db.select().from(s.payments).where(eq(s.payments.orderId, orderId));
  return confirmTransfer(adminId, p!.id, transferConfirmationSchema.parse({ amount: String(p!.amount), receivedOn: today(), bankReference: "", note: "", commandId: randomUUID() }));
};
const emails = () => db.select().from(s.emailOutbox).orderBy(s.emailOutbox.createdAt);
/** Proveedor de correo de prueba: guarda lo enviado. */
const inbox = () => {
  const sent: Parameters<Deliver>[0][] = [];
  const deliver: Deliver = async (m) => {
    sent.push(m);
  };
  return { sent, deliver };
};

describe("IP real detrás del proxy", () => {
  it("con N proxies confiables usa la N-ésima IP desde el final; sin proxy no confía en el encabezado", () => {
    const h = new Headers({ "x-forwarded-for": "6.6.6.6, 200.1.1.1, 10.0.0.2" }); // "6.6.6.6" lo inventó el cliente
    expect(clientIp(h, 0)).toBe("local");
    expect(clientIp(h, 1)).toBe("10.0.0.2");
    expect(clientIp(h, 2)).toBe("200.1.1.1");
    expect(clientIp(new Headers(), 1)).toBe("desconocida");
  });
});

describe("límite de pedidos pendientes", () => {
  it(`máximo ${MAX_PENDING_PER_EMAIL} pedidos esperando pago por email; al pagar uno se puede crear otro`, async () => {
    const v = await makeVariant(20);
    const first = await order(v.id);
    for (let i = 1; i < MAX_PENDING_PER_EMAIL; i++) await order(v.id);
    await expect(order(v.id)).rejects.toBeInstanceOf(UserError);
    await expect(order(v.id, "otra@test.cl")).resolves.toBeTruthy(); // otro email no se ve afectado
    expect((await db.select().from(s.productVariants).where(eq(s.productVariants.id, v.id)))[0]!.stockReserved).toBe(MAX_PENDING_PER_EMAIL + 1);
    await confirm(first.id);
    await expect(order(v.id)).resolves.toBeTruthy();
  });
});

describe("correos al cliente", () => {
  it("se encolan con el hecho que avisan (pedido, pago, despacho), una vez cada uno", async () => {
    const v = await makeVariant(5);
    const o = await order(v.id);
    await confirm(o.id);
    await changeOrderStatus(adminId, o.id, { to: "PROCESSING", note: null });
    await changeOrderStatus(adminId, o.id, { to: "SHIPPED", note: null });
    expect((await emails()).map((e) => [e.kind, e.to, e.status])).toEqual([
      ["order.received", "cliente@test.cl", "PENDING"],
      ["order.paid", "cliente@test.cl", "PENDING"],
      ["order.shipped", "cliente@test.cl", "PENDING"],
    ]);
    // Un pedido que no se crea no deja correo.
    const cart = await addToCart(null, { variantId: v.id, quantity: 1 });
    await expect(placeOrder(cart, { ...(await getCartInput()), expectedTotal: 1 }, "transferencia")).rejects.toBeInstanceOf(UserError);
    expect(await db.$count(s.emailOutbox)).toBe(3);
  });

  it("al enviar arma el texto con los datos vigentes: instrucciones de pago, enlace y aviso de que no es boleta", async () => {
    const v = await makeVariant(5);
    const o = await order(v.id);
    const { sent, deliver } = inbox();
    expect(await sendPendingEmails({ deliver })).toMatchObject({ sent: 1, failed: 0 });
    const [m] = sent;
    expect(m!.subject).toBe(`Recibimos tu pedido ${o.orderNumber}`);
    expect(m!.text).toContain("Datos para la transferencia");
    expect(m!.text).toContain(`Comentario / referencia: ${o.orderNumber}`);
    expect(m!.text).toContain(`/pedido/${o.id}`);
    expect(m!.text).toContain("no es una boleta");
    expect((await emails())[0]).toMatchObject({ status: "SENT", tries: 1 });
    expect(await sendPendingEmails({ deliver })).toMatchObject({ sent: 0 }); // ya salió: no se repite
  });

  it("un aviso que ya no corresponde no se envía; uno viejo tampoco", async () => {
    const v = await makeVariant(5);
    const o = await order(v.id);
    await changeOrderStatus(adminId, o.id, { to: "CANCELLED", note: "Desistió" });
    const o2 = await order(v.id, "otro@test.cl");
    await db.update(s.emailOutbox).set({ createdAt: sql`now() - interval '4 days'` }).where(eq(s.emailOutbox.orderId, o2.id));
    const { sent, deliver } = inbox();
    await sendPendingEmails({ deliver });
    expect(sent).toEqual([]);
    expect((await emails()).map((e) => e.status)).toEqual(["SKIPPED", "SKIPPED"]);
  });

  it("si el proveedor falla se reintenta y a los 5 intentos queda como fallido; sin proveedor, espera en cola", async () => {
    const v = await makeVariant(5);
    await order(v.id);
    expect(await sendPendingEmails({ deliver: null })).toMatchObject({ waiting: 1 });
    expect((await emails())[0]).toMatchObject({ status: "PENDING", tries: 0 });
    const down: Deliver = async () => {
      throw new Error("El proveedor de correo respondió 503.");
    };
    for (let i = 0; i < 5; i++) await sendPendingEmails({ deliver: down });
    expect((await emails())[0]).toMatchObject({ status: "FAILED", tries: 5, lastError: "El proveedor de correo respondió 503." });
  });

  it("dos envíos simultáneos no mandan el mismo correo dos veces", async () => {
    const v = await makeVariant(10);
    for (let i = 0; i < 3; i++) await order(v.id, `c${i}@test.cl`);
    const { sent, deliver } = inbox();
    await Promise.all([sendPendingEmails({ deliver }), sendPendingEmails({ deliver })]);
    expect(sent.map((m) => m.to).sort()).toEqual(["c0@test.cl", "c1@test.cl", "c2@test.cl"]);
  });
});

describe("feed de productos (Google Merchant / Meta)", () => {
  it("valida el GTIN con su dígito verificador y descarta los códigos internos", () => {
    expect(validGtin("7801234567892")).toBe(false); // dígito verificador incorrecto
    expect(validGtin("7802800500208")).toBe(true);
    expect(validGtin("96385074")).toBe(true); // EAN-8
    expect(validGtin("2000000000008")).toBe(false); // uso interno (prefijo 2)
    expect(validGtin(null)).toBe(false);
  });

  it("incluye solo variantes a la venta de productos publicados con foto; precios en CLP y texto escapado", async () => {
    const v = await makeVariant(3);
    const [brand] = await db.insert(s.brands).values({ name: "Marca & Cía", slug: "marca-cia" }).returning();
    await db.update(s.products).set({ name: "Jabón <Avena> & Miel", brandId: brand!.id }).where(eq(s.products.id, v.productId));
    await db.update(s.productVariants).set({ price: 1990, compareAtPrice: 2490, barcode: "7802800500208" }).where(eq(s.productVariants.id, v.id));
    await db.insert(s.productImages).values({ productId: v.productId, url: "/media/foto.jpg" });
    const noPhoto = await makeVariant(3);
    const draft = await makeVariant(3);
    await db.insert(s.productImages).values({ productId: draft.productId, url: "/media/otra.jpg" });
    await db.update(s.products).set({ active: false }).where(eq(s.products.id, draft.productId));

    const xml = await productFeedXml();
    expect(xml.match(/<item>/g)).toHaveLength(1);
    expect(xml).toContain(`<g:id>${v.sku}</g:id>`);
    expect(xml).toContain("<title>Jabón &lt;Avena&gt; &amp; Miel</title>");
    expect(xml).toContain("<g:price>2490 CLP</g:price><g:sale_price>1990 CLP</g:sale_price>");
    expect(xml).toContain("<g:brand>Marca &amp; Cía</g:brand><g:gtin>7802800500208</g:gtin>");
    expect(xml).toContain("<g:availability>in_stock</g:availability>");
    expect(xml).not.toContain(noPhoto.sku);
    expect(xml).not.toContain(draft.sku);
  });
});

describe("primer Super Admin", () => {
  it("lo crea el sistema (sin usuario actor) y queda auditado", async () => {
    const u = await createStaffUser(null, newUserSchema.parse({ email: "Duenio@Tienda.cl", role: "SUPER_ADMIN", password: "una-clave-larga" }));
    expect(u).toMatchObject({ email: "duenio@tienda.cl", role: "SUPER_ADMIN" });
    expect(u).not.toHaveProperty("passwordHash");
    const [log] = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "user.create"));
    expect(log!.userId).toBeNull();
  });
});

async function getCartInput() {
  return { email: "cliente@test.cl", firstName: "Ana", lastName: "Pérez", phone: "+56912345678", rut: null, communeId, street: "Calle", number: "1", apartment: null, notes: null };
}
