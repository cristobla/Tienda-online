import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { resetDb } from "../../../tests/helpers";
import { hashPassword, verifyPassword } from "./password";
import { can } from "./rbac";
import { authenticate, createSession, revokeSession, validateSession } from "./session";

describe("contraseñas", () => {
  it("hash Argon2id verificable y no reversible", async () => {
    const h = await hashPassword("una-clave-segura");
    expect(h).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(h, "una-clave-segura")).toBe(true);
    expect(await verifyPassword(h, "otra")).toBe(false);
    expect(await verifyPassword("basura", "x")).toBe(false);
  });
});

describe("permisos", () => {
  it("cliente no accede al panel", () => {
    expect(can("CUSTOMER", "catalog:write")).toBe(false);
    expect(can("CUSTOMER", "orders:read")).toBe(false);
  });
  it("admin gestiona todo menos usuarios; super admin todo", () => {
    expect(can("ADMIN", "inventory:adjust")).toBe(true);
    expect(can("ADMIN", "users:manage")).toBe(false);
    expect(can("SUPER_ADMIN", "users:manage")).toBe(true);
  });
  it("bodega ajusta inventario pero no edita catálogo", () => {
    expect(can("WAREHOUSE", "inventory:adjust")).toBe(true);
    expect(can("WAREHOUSE", "catalog:write")).toBe(false);
  });
});

describe("sesiones", () => {
  beforeEach(resetDb);
  const mkUser = async (active = true) =>
    (await db.insert(users).values({ email: "cliente@test.cl", passwordHash: await hashPassword("clave-de-prueba"), active }).returning())[0]!;

  it("autentica con credenciales correctas, sin distinguir mayúsculas del email", async () => {
    await mkUser();
    expect(await authenticate("Cliente@Test.cl", "clave-de-prueba")).toMatchObject({ email: "cliente@test.cl", role: "CUSTOMER" });
    expect(await authenticate("cliente@test.cl", "mala")).toBeNull();
    expect(await authenticate("noexiste@test.cl", "clave-de-prueba")).toBeNull();
  });

  it("usuario desactivado no puede entrar", async () => {
    await mkUser(false);
    expect(await authenticate("cliente@test.cl", "clave-de-prueba")).toBeNull();
  });

  it("guarda solo el hash del token; valida, expira y revoca", async () => {
    const u = await mkUser();
    const { token } = await createSession(u.id);
    const [row] = await db.select().from(sessions);
    expect(row!.id).not.toBe(token);
    expect(await validateSession(token)).toMatchObject({ id: u.id });
    expect(await validateSession("token-falso")).toBeNull();

    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.userId, u.id));
    expect(await validateSession(token)).toBeNull();

    const second = await createSession(u.id);
    await revokeSession(second.token);
    expect(await validateSession(second.token)).toBeNull();
  });
});
