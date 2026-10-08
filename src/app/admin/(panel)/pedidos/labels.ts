import type { OrderStatus, PaymentStatus } from "@/modules/orders";

type Tone = "ok" | "warn" | "bad" | "off";

export const ORDER_TONE: Record<OrderStatus, Tone> = {
  PENDING_PAYMENT: "warn",
  PAID: "ok",
  PROCESSING: "ok",
  SHIPPED: "ok",
  DELIVERED: "ok",
  CANCELLED: "off",
  REFUNDED: "bad",
};

export const PAYMENT_TONE: Record<PaymentStatus, Tone> = {
  PENDING: "warn",
  AUTHORIZED: "warn",
  PAID: "ok",
  FAILED: "bad",
  EXPIRED: "off",
  CANCELLED: "off",
  REFUNDED: "bad",
  PARTIALLY_REFUNDED: "bad",
  UNCERTAIN: "warn",
  REVIEW: "bad",
};
