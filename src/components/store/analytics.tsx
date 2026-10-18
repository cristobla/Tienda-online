"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Medición (Google Analytics 4 y píxel de Meta) solo con consentimiento: nada se carga ni se envía hasta que la
 * persona acepta (Ley 21.719). La elección queda en este navegador; «Preferencias de cookies» del pie la reabre.
 * Sin IDs configurados (GA_ID / META_PIXEL_ID) este componente no muestra nada.
 */
type Fbq = ((...a: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue: unknown[]; push?: Fbq; loaded?: boolean; version?: string };
type W = typeof window & { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void; fbq?: Fbq; _fbq?: Fbq };
const KEY = "consentimiento-medicion";
export const OPEN_CONSENT = "abrir-consentimiento";

const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

function load(gaId: string | null, pixelId: string | null) {
  const w = window as W;
  const add = (src: string) => {
    const s = document.createElement("script");
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  };
  if (gaId && !w.gtag) {
    w.dataLayer = w.dataLayer || [];
    // gtag espera el objeto `arguments`, no un arreglo.
    w.gtag = function () {
      w.dataLayer!.push(arguments);
    };
    w.gtag("js", new Date());
    w.gtag("config", gaId);
    add(`https://www.googletagmanager.com/gtag/js?id=${gaId}`);
  }
  if (pixelId && !w.fbq) {
    // Igual que el fragmento oficial de Meta: encola hasta que fbevents.js define callMethod.
    const n: Fbq = Object.assign(
      (...a: unknown[]) => {
        if (n.callMethod) n.callMethod(...a);
        else n.queue.push(a);
      },
      { queue: [] as unknown[] },
    );
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    w.fbq = w._fbq = n;
    add("https://connect.facebook.net/en_US/fbevents.js");
    w.fbq("init", pixelId);
    w.fbq("track", "PageView");
  }
}

/** Evento de comercio a ambas plataformas (si la persona aceptó). Ids = SKU, los mismos del feed de productos. */
export function track(event: "add_to_cart" | "purchase", data: { value: number; items: { sku: string; name: string; price: number; quantity: number }[]; orderNumber?: string }) {
  const w = window as W;
  w.gtag?.("event", event, {
    currency: "CLP",
    value: data.value,
    transaction_id: data.orderNumber,
    items: data.items.map((i) => ({ item_id: i.sku, item_name: i.name, price: i.price, quantity: i.quantity })),
  });
  w.fbq?.("track", event === "purchase" ? "Purchase" : "AddToCart", {
    currency: "CLP",
    value: data.value,
    content_type: "product",
    content_ids: data.items.map((i) => i.sku),
    contents: data.items.map((i) => ({ id: i.sku, quantity: i.quantity })),
  });
}

export function Analytics({ gaId, pixelId }: { gaId: string | null; pixelId: string | null }) {
  const [choice, setChoice] = useState<string | null | undefined>(undefined);
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    const c = read();
    setChoice(c);
    if (c === "si") load(gaId, pixelId);
    const open = () => setChoice(null);
    window.addEventListener(OPEN_CONSENT, open);
    return () => window.removeEventListener(OPEN_CONSENT, open);
  }, [gaId, pixelId]);

  // Navegación sin recarga: GA4 la mide solo (historial del navegador); el píxel necesita su PageView.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    (window as W).fbq?.("track", "PageView");
  }, [pathname]);

  if (!gaId && !pixelId) return null;
  if (choice !== null) return null; // undefined = aún leyendo; "si"/"no" = ya eligió

  const decide = (c: "si" | "no") => {
    try {
      localStorage.setItem(KEY, c);
    } catch {}
    setChoice(c);
    if (c === "si") load(gaId, pixelId);
    else if ((window as W).gtag || (window as W).fbq) location.reload(); // retirar el consentimiento descarga lo ya cargado
  };

  return (
    <div role="dialog" aria-label="Cookies de medición" className="fixed inset-x-4 bottom-20 z-50 mx-auto max-w-md rounded-[1.25rem] bg-ink p-5 text-sm text-white sm:bottom-4 sm:left-4 sm:right-auto">
      <p>
        Usamos cookies de medición (Google y Meta) para saber qué productos interesan y mejorar la tienda. Solo se activan si aceptas.{" "}
        <a href="/info/privacidad" className="underline underline-offset-2">
          Privacidad
        </a>
      </p>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={() => decide("si")} className="btn-buy flex-1 px-4 py-2">
          Aceptar
        </button>
        <button type="button" onClick={() => decide("no")} className="flex-1 rounded-full border border-white/40 px-4 py-2 font-semibold hover:border-white">
          Rechazar
        </button>
      </div>
    </div>
  );
}

/** Enlace del pie para cambiar la elección. */
export function ConsentLink({ className }: { className?: string }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT))} className={className}>
      Preferencias de cookies
    </button>
  );
}

/** Compra confirmada: se informa una sola vez por pedido en este navegador. */
export function TrackPurchase({ orderNumber, value, items }: { orderNumber: string; value: number; items: { sku: string; name: string; price: number; quantity: number }[] }) {
  useEffect(() => {
    const key = `compra-medida:${orderNumber}`;
    try {
      if (read() !== "si" || localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      return;
    }
    // Espera un instante a que las etiquetas se carguen (Analytics se monta en el layout).
    const t = setTimeout(() => track("purchase", { value, items, orderNumber }), 500);
    return () => clearTimeout(t);
  }, [orderNumber, value, items]);
  return null;
}
