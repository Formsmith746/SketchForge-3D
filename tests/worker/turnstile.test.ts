import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { validateTurnstileToken } from "../../worker/src/index";
import type { Env } from "../../worker/src/types";

const bindings = env as unknown as Env;
const ORIGIN = "http://sketchforge.test";

function siteverifyResponse(body: Record<string, unknown>, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  }));
}

describe("Turnstile authentication gate", () => {
  it("publishes only the site key and action", async () => {
    const response = await SELF.fetch(`${ORIGIN}/api/cloud/turnstile/config`);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({
      siteKey: bindings.TURNSTILE_SITE_KEY,
      action: "turnstile-spin-v2",
    });
    expect(JSON.stringify(payload).includes(bindings.TURNSTILE_SECRET)).toBe(false);
  });

  it("rejects attempts to start Google authentication without a Turnstile token", async () => {
    const response = await SELF.fetch(`${ORIGIN}/api/cloud/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({ returnTo: "/cloud" }),
    });
    expect(response.status).toBe(400);
    expect((await response.json() as { error: string }).error).toBe("TURNSTILE_TOKEN_REQUIRED");
  });

  it("accepts only successful tokens for the configured hostname and action", async () => {
    const result = await validateTurnstileToken(bindings, "valid-token", undefined, () => siteverifyResponse({
      success: true,
      hostname: "sketchforge.test",
      action: "turnstile-spin-v2",
    }));
    expect(result.success).toBe(true);

    for (const responseBody of [
      { success: false, hostname: "sketchforge.test", action: "turnstile-spin-v2" },
      { success: true, hostname: "attacker.test", action: "turnstile-spin-v2" },
      { success: true, hostname: "sketchforge.test", action: "wrong-action" },
    ]) {
      await expect(validateTurnstileToken(bindings, "invalid-token", undefined, () => siteverifyResponse(responseBody)))
        .rejects.toMatchObject({ status: 403, code: "TURNSTILE_VERIFICATION_FAILED" });
    }
  });

  it("fails closed when Siteverify is unavailable", async () => {
    await expect(validateTurnstileToken(bindings, "valid-token", undefined, () => Promise.reject(new Error("offline"))))
      .rejects.toMatchObject({ status: 503, code: "TURNSTILE_UNAVAILABLE" });
  });
});
