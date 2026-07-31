import type { Env } from "./types";

export interface StripeObject {
  id: string;
  object?: string;
  status?: string;
  customer?: string | { id: string } | null;
  subscription?: string | { id: string } | null;
  metadata?: Record<string, string>;
  current_period_start?: number;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  cancel_at?: number | null;
  canceled_at?: number | null;
  ended_at?: number | null;
  payment_status?: string;
  items?: { data?: Array<{ current_period_start?: number; current_period_end?: number }> };
}

export interface StripeEvent {
  id: string;
  type: string;
  created?: number;
  livemode?: boolean;
  data: { object: StripeObject };
}

export function assertStripeTestMode(env: Env) {
  if (env.APP_ENV === "production" && !env.STRIPE_SECRET_KEY.startsWith("sk_live_")) {
    throw new Error("PRODUCTION_REQUIRES_STRIPE_LIVE_KEY");
  }
  if (env.APP_ENV !== "production" && !env.STRIPE_SECRET_KEY.startsWith("sk_test_")) {
    throw new Error("STAGING_REQUIRES_STRIPE_TEST_KEY");
  }
  if (env.APP_ENV !== "production" && env.STRIPE_PRICE_ID && !env.STRIPE_PRICE_ID.startsWith("price_")) {
    throw new Error("STAGING_STRIPE_PRICE_NOT_CONFIGURED");
  }
}

export function stripeId(value: StripeObject["customer"] | StripeObject["subscription"]) {
  return typeof value === "string" ? value : value?.id ?? null;
}

export async function stripeRequest<T>(
  env: Env,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: URLSearchParams,
  idempotencyKey?: string,
) {
  assertStripeTestMode(env);
  const headers = new Headers({ Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` });
  if (body) headers.set("Content-Type", "application/x-www-form-urlencoded");
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  const response = await fetch(`https://api.stripe.com${path}`, { method, headers, body });
  const payload = (await response.json().catch(() => null)) as (T & { error?: { type?: string; code?: string; message?: string } }) | null;
  if (!response.ok || !payload) {
    const code = payload?.error?.code ?? payload?.error?.type ?? `HTTP_${response.status}`;
    throw new Error(`STRIPE_${code}`);
  }
  return payload;
}

export function subscriptionPeriod(subscription: StripeObject) {
  const firstItem = subscription.items?.data?.[0];
  return {
    start: subscription.current_period_start ?? firstItem?.current_period_start ?? null,
    end: subscription.current_period_end ?? firstItem?.current_period_end ?? null,
  };
}
