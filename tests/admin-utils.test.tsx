import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "@/lib/markdown";
import { sniffImage } from "@/lib/storage";
import { changedFields } from "@/modules/audit";
import { clearFailures, isBlocked, registerFailure } from "@/modules/auth/rate-limit";

describe("Markdown básico", () => {
  const html = (t: string) => renderToStaticMarkup(<Markdown text={t} />);

  it("párrafos, saltos, listas, títulos, negrita y cursiva", () => {
    expect(html("## Uso\nAplicar **sobre** cabello *húmedo*.\nEnjuagar.\n\n- Uno\n- Dos\n\n1. Primero")).toBe(
      "<h4>Uso</h4><p>Aplicar <strong>sobre</strong> cabello <em>húmedo</em>.<br/>Enjuagar.</p><ul><li>Uno</li><li>Dos</li></ul><ol><li>Primero</li></ol>",
    );
  });

  it("no permite HTML ni enlaces: todo se escapa", () => {
    const out = html('<script>alert(1)</script> <img src=x onerror="x()"> [clic](javascript:alert(1))');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<a");
    expect(out).toContain("&lt;script&gt;");
  });
});

describe("tipo real de imagen", () => {
  const bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
  it("reconoce por contenido, no por nombre", () => {
    expect(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(sniffImage(bytes("\x89PNG\r\n\x1a\n...."))).toBe("png");
    expect(sniffImage(bytes("RIFF\0\0\0\0WEBPVP8 "))).toBe("webp");
    expect(sniffImage(bytes("\0\0\0\x1cftypavif"))).toBe("avif");
    expect(sniffImage(bytes("<svg xmlns="))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});

describe("límite de intentos de login", () => {
  it("bloquea tras el máximo y se libera al vencer la ventana o al entrar bien", () => {
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) registerFailure("k", t);
    expect(isBlocked("k", 5, t)).toBe(true);
    expect(isBlocked("k", 6, t)).toBe(false);
    expect(isBlocked("k", 5, t + 15 * 60_000)).toBe(false);
    registerFailure("j", t);
    clearFailures("j");
    expect(isBlocked("j", 1, t)).toBe(false);
  });
});

it("auditoría: muestra solo los campos que cambiaron", () => {
  expect(changedFields({ price: 1, name: "a", updatedAt: 1 }, { price: 2, name: "a", updatedAt: 2, sku: "X" })).toEqual([
    { field: "price", before: 1, after: 2 },
    { field: "sku", before: undefined, after: "X" },
  ]);
});
