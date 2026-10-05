import { describe, expect, it } from "vitest";
import regions from "@/db/data/chile-regions.json";
import { formatCLP, formatRut, netFromGross, normalizeChileanPhone, normalizeRut } from ".";

describe("RUT", () => {
  it("valida y normaliza", () => {
    expect(normalizeRut("11.111.111-1")).toBe("11111111-1");
    expect(normalizeRut("12.345.678-5")).toBe("12345678-5");
    expect(normalizeRut("7.775.766-k")).toBe("7775766-K");
    expect(normalizeRut("12345678-0")).toBeNull();
    expect(normalizeRut("abc")).toBeNull();
  });
  it("formatea", () => expect(formatRut("12345678-5")).toBe("12.345.678-5"));
});

describe("teléfono", () => {
  it("normaliza a E.164", () => {
    expect(normalizeChileanPhone("9 1234 5678")).toBe("+56912345678");
    expect(normalizeChileanPhone("+56 9 1234 5678")).toBe("+56912345678");
    expect(normalizeChileanPhone("22 123 4567")).toBe("+56221234567");
    expect(normalizeChileanPhone("1234")).toBeNull();
  });
});

describe("CLP", () => {
  it("formatea sin decimales", () => expect(formatCLP(12990).replace(/\s/g, "")).toBe("$12.990"));
  it("separa IVA", () => expect(netFromGross(11900)).toEqual({ net: 10000, iva: 1900 }));
});

describe("datos de regiones", () => {
  it("16 regiones y 346 comunas", () => {
    expect(regions).toHaveLength(16);
    expect(regions.reduce((n, r) => n + r.communes.length, 0)).toBe(346);
  });
});
