import { afterEach, describe, expect, it, vi } from "vitest";
import { buildStripeCheckoutParams, findLatestSubscription, verifyStripeSignature } from "../../worker/src/index";
import { hmacHex } from "../../worker/src/security";
import { stripeRequest } from "../../worker/src/stripe";
import type { Env } from "../../worker/src/types";

afterEach(() => vi.unstubAllGlobals());

describe("Stripe webhook security", () => {
  it("accepts a current valid signature over the exact raw body", async () => {
    const secret = "whsec_test_secret";
    const timestamp = 2_000_000_000;
    const body = '{"id":"evt_test"}';
    const signature = await hmacHex(secret, `${timestamp}.${body}`);
    await expect(verifyStripeSignature(body, `t=${timestamp},v1=${signature}`, secret, timestamp)).resolves.toBe(true);
  });

  it("rejects changed bodies, stale signatures, and missing signatures", async () => {
    const secret = "whsec_test_secret";
    const timestamp = 2_000_000_000;
    const signature = await hmacHex(secret, `${timestamp}.original`);
    await expect(verifyStripeSignature("changed", `t=${timestamp},v1=${signature}`, secret, timestamp)).resolves.toBe(false);
    await expect(verifyStripeSignature("original", `t=${timestamp},v1=${signature}`, secret, timestamp + 301)).resolves.toBe(false);
    await expect(verifyStripeSignature("original", null, secret, timestamp)).resolves.toBe(false);
  });
});

describe("out-of-order webhook handling", () => {
  it("retrieves Stripe's current subscription instead of trusting the event snapshot", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "sub_123", status: "past_due" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const env = { APP_ENV: "staging", STRIPE_SECRET_KEY: "sk_test_123", STRIPE_PRICE_ID: "price_123" } as Env;
    const current = await findLatestSubscription(env, { id: "evt_object", object: "invoice", subscription: "sub_123" });
    expect(current?.status).toBe("past_due");
    expect(fetchMock).toHaveBeenCalledWith("https://api.stripe.com/v1/subscriptions/sub_123", expect.objectContaining({ method: "GET" }));
  });

  it("deletes Stripe customers using the test-mode customer deletion endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "cus_test", deleted: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const env = { APP_ENV: "staging", STRIPE_SECRET_KEY: "sk_test_123", STRIPE_PRICE_ID: "price_123" } as Env;
    await expect(stripeRequest(env, "DELETE", "/v1/customers/cus_test")).resolves.toMatchObject({ deleted: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.stripe.com/v1/customers/cus_test",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});

describe("Stripe Checkout tax configuration", () => {
  const baseEnv = {
    APP_BASE_URL: "https://cloud.sketchforge3d.com",
    STRIPE_PRICE_ID: "price_live_123",
  } as Env;

  it("enables automatic tax and updates the Stripe customer address in production", () => {
    const params = buildStripeCheckoutParams({ ...baseEnv, APP_ENV: "production" }, "user-123", "cus_123");
    expect(params.get("automatic_tax[enabled]")).toBe("true");
    expect(params.get("billing_address_collection")).toBe("required");
    expect(params.get("customer_update[address]")).toBe("auto");
    expect(params.get("line_items[0][price]")).toBe("price_live_123");
  });

  it("keeps staging isolated from the live automatic-tax configuration", () => {
    const params = buildStripeCheckoutParams({ ...baseEnv, APP_ENV: "staging" }, "user-123", "cus_123");
    expect(params.has("automatic_tax[enabled]")).toBe(false);
    expect(params.has("billing_address_collection")).toBe(false);
    expect(params.has("customer_update[address]")).toBe(false);
  });
});
