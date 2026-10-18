import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import * as s from "@/db/schema";
import { hashPassword } from "@/modules/auth/password";
import { authenticate } from "@/modules/auth/session";
import { base32, disableTotp, enableTotp, matchTotp, newTotpSecret, resetTotp, totpCode } from "@/modules/auth/totp";
import { getUser } from "@/modules/auth/users";
import { resetDb } from "./helpers";

const PASS = "clave-de-prueba-123";
let userId: string;
beforeEach(async () => {
  await resetDb();
  const [u] = await db.insert(s.users).values({ email: "admin@test.cl", passwordHash: await hashPassword(PASS), role: "ADMIN" }).returning();
  userId = u!.id;
});
const now = () => totpCode(secretOf.value!, Math.floor(Date.now() / 30_000));
const secretOf: { value?: string } = {};

describe("TOTP", () => {
  it("coincide con el vector de prueba del RFC 6238 y acepta ±30 s", () => {
    const rfc = base32(Buffer.from("12345678901234567890"));
    expect(totpCode(rfc, 1)).toBe("287082"); // T = 59 s → 94287082 (8 dígitos)
    expect(totpCode(rfc, Math.floor(1111111109 / 30))).toBe("081804");
    const t = 1_700_000_000_000;
    const step = Math.floor(t / 30_000);
    expect(matchTotp(rfc, totpCode(rfc, step - 1), t)).toBe(step - 1);
    expect(matchTotp(rfc, totpCode(rfc, step - 2), t)).toBeNull();
    expect(matchTotp(rfc, "12345", t)).toBeNull();
    expect(newTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });

  it("activar exige contraseña y código; el ingreso pide el código y no acepta el mismo dos veces", async () => {
    const secret = (secretOf.value = newTotpSecret());
    await expect(enableTotp(userId, { secret, code: now(), currentPassword: "mala" })).rejects.toThrow("contraseña");
    await expect(enableTotp(userId, { secret, code: "000000", currentPassword: PASS })).rejects.toThrow("no coincide");
    // El código usado para activar ya no sirve para ingresar.
    const code = now();
    await enableTotp(userId, { secret, code, currentPassword: PASS });
    expect((await getUser(userId))!.has2fa).toBe(true);
    expect(await authenticate("admin@test.cl", PASS)).toBe("code");
    expect(await authenticate("admin@test.cl", PASS, code)).toBe("code");
    expect(await authenticate("admin@test.cl", "mala", code)).toBeNull();

    // Siguiente paso de 30 s: sirve una vez.
    await db.update(s.users).set({ totpLastStep: Math.floor(Date.now() / 30_000) - 2 }).where(eq(s.users.id, userId));
    const fresh = now();
    expect(await authenticate("admin@test.cl", PASS, fresh)).toMatchObject({ id: userId });
    expect(await authenticate("admin@test.cl", PASS, fresh)).toBe("code");
  });

  it("desactivar exige código actual; un super administrador puede quitarla; todo auditado", async () => {
    const secret = (secretOf.value = newTotpSecret());
    await enableTotp(userId, { secret, code: now(), currentPassword: PASS });
    await db.update(s.users).set({ totpLastStep: 0 }).where(eq(s.users.id, userId));
    await expect(disableTotp(userId, { code: "000000", currentPassword: PASS })).rejects.toThrow("código");
    await disableTotp(userId, { code: now(), currentPassword: PASS });
    expect((await getUser(userId))!.has2fa).toBe(false);
    expect(await authenticate("admin@test.cl", PASS)).toMatchObject({ id: userId });

    await enableTotp(userId, { secret, code: now(), currentPassword: PASS });
    await resetTotp(userId, userId);
    expect((await getUser(userId))!.has2fa).toBe(false);
    const actions = (await db.select({ a: s.auditLogs.action }).from(s.auditLogs)).map((r) => r.a);
    expect(actions).toEqual(["user.2fa_enable", "user.2fa_disable", "user.2fa_enable", "user.2fa_reset"]);
    // El secreto nunca sale del módulo de usuarios.
    expect(JSON.stringify(await getUser(userId))).not.toContain(secret);
  });
});
