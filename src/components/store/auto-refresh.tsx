"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Vuelve a pedir la página al servidor cada `seconds`, como máximo `max` veces (consulta acotada: el estado
 * siempre lo decide el servidor). Después invita a recargar.
 */
export function AutoRefresh({ seconds = 20, max = 30 }: { seconds?: number; max?: number }) {
  const router = useRouter();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= max) return;
    const t = setTimeout(() => {
      router.refresh();
      setN((x) => x + 1);
    }, seconds * 1000);
    return () => clearTimeout(t);
  }, [n, max, seconds, router]);
  return n >= max ? <p className="mt-2 text-xs text-muted">Recarga la página para ver el estado más reciente.</p> : null;
}
