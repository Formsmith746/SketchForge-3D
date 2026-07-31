import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { processApprovedAccountDeletions } from "../../worker/src/index";
import { sessionCookieName, sha256, signValue } from "../../worker/src/security";
import { createEmptySkfProject, SKF_MEDIA_TYPE } from "../../worker/src/skfValidation";
import type { Env } from "../../worker/src/types";

const bindings = env as unknown as Env;
const ORIGIN = "http://sketchforge.test";

async function seedUser(status = "active", options: { legal?: boolean; expiredSession?: boolean; graceEndsAt?: number | null; periodEnd?: number } = {}) {
  const id = crypto.randomUUID();
  const email = `${id}@example.test`;
  const now = Math.floor(Date.now() / 1000);
  const legal = options.legal !== false;
  await bindings.DB.prepare(
    `INSERT INTO users (
      id, google_subject, email, email_verified, display_name, created_at, last_login_at, updated_at,
      terms_version, privacy_version, legal_accepted_at, subscription_status, subscription_period_end,
      retention_delete_eligible_at
    ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, `google-${id}`, email, "Worker test", now, now, now,
    legal ? bindings.CURRENT_TERMS_VERSION : "old-terms",
    legal ? bindings.CURRENT_PRIVACY_VERSION : "old-privacy",
    legal ? now : null,
    status,
    options.periodEnd ?? now + 3600,
    options.graceEndsAt ?? null,
  ).run();
  const token = `token-${id}`;
  await bindings.DB.prepare(
    "INSERT INTO sessions (id_hash, user_id, created_at, expires_at, authenticated_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(await sha256(token), id, now, options.expiredSession ? now - 1 : now + 3600, now, now).run();
  const signed = await signValue(bindings.SESSION_SECRET, token);
  return { id, email, cookie: `${sessionCookieName(false)}=${encodeURIComponent(signed)}` };
}

async function seedProject(
  ownerId: string,
  sourceDocument: Record<string, unknown> = { formatVersion: 1, shapes: [], workspace: null, snap: null },
) {
  const id = crypto.randomUUID();
  const key = `users/${ownerId}/projects/${id}/seed.json`;
  const document = JSON.stringify(sourceDocument);
  const now = Math.floor(Date.now() / 1000);
  await bindings.PROJECTS.put(key, document, { httpMetadata: { contentType: "application/json" } });
  await bindings.DB.prepare(
    "INSERT INTO projects (id, owner_user_id, name, r2_object_key, size_bytes, format_version, version, created_at, updated_at) VALUES (?, ?, 'Private project', ?, ?, 1, 1, ?, ?)",
  ).bind(id, ownerId, key, new TextEncoder().encode(document).byteLength, now, now).run();
  await bindings.DB.prepare("UPDATE users SET project_count = project_count + 1, storage_used_bytes = storage_used_bytes + ? WHERE id = ?")
    .bind(new TextEncoder().encode(document).byteLength, ownerId).run();
  return { id, key };
}

function request(path: string, cookie: string, init: RequestInit = {}) {
  return SELF.fetch(`${ORIGIN}${path}`, {
    ...init,
    headers: { cookie, ...(init.method && init.method !== "GET" ? { origin: ORIGIN, "sec-fetch-site": "same-origin" } : {}), ...init.headers },
  });
}

describe("real Cloud Worker routes", () => {
  it("denies unauthenticated and expired sessions", async () => {
    expect((await SELF.fetch(`${ORIGIN}/api/cloud/projects`)).status).toBe(401);
    const expired = await seedUser("active", { expiredSession: true });
    expect((await request("/api/cloud/projects", expired.cookie)).status).toBe(401);
  });

  it("hides every project operation from another user and rejects CSRF", async () => {
    const owner = await seedUser();
    const attacker = await seedUser();
    const { id: projectId } = await seedProject(owner.id);
    const operations: Array<[string, RequestInit]> = [
      [`/api/cloud/projects/${projectId}`, {}],
      [`/api/cloud/projects/${projectId}/export`, {}],
      [`/api/cloud/projects/${projectId}/thumbnail`, {}],
      [`/api/cloud/projects/${projectId}`, { method: "PUT", body: JSON.stringify({ formatVersion: 1, shapes: [], workspace: null, snap: null, expectedVersion: 1 }) }],
      [`/api/cloud/projects/${projectId}`, { method: "PATCH", body: JSON.stringify({ name: "No" }) }],
      [`/api/cloud/projects/${projectId}`, { method: "DELETE" }],
      [`/api/cloud/projects/${projectId}/thumbnail`, { method: "PUT", body: JSON.stringify({ dataUrl: "invalid", expectedVersion: 1 }) }],
    ];
    for (const [path, init] of operations) {
      const response = await request(path, attacker.cookie, init);
      expect(response.status, `${init.method ?? "GET"} ${path}`).toBe(404);
    }
    const csrf = await SELF.fetch(`${ORIGIN}/api/cloud/projects/${projectId}`, {
      method: "PATCH",
      headers: { cookie: owner.cookie, "content-type": "application/json" },
      body: JSON.stringify({ name: "Blocked" }),
    });
    expect(csrf.status).toBe(403);
  });

  it("stores only validated .skf packages under a server-chosen R2 key", async () => {
    const owner = await seedUser();
    const project = await seedProject(owner.id);
    const skf = createEmptySkfProject(project.id, "Private project", Math.floor(Date.now() / 1000));
    const save = await request(`/api/cloud/projects/${project.id}`, owner.cookie, {
      method: "PUT",
      headers: {
        "content-type": SKF_MEDIA_TYPE,
        "x-sketchforge-expected-version": "1",
      },
      body: skf,
    });
    expect(save.status).toBe(200);
    expect(await save.json()).toMatchObject({ ok: true, version: 2, sizeBytes: skf.byteLength });

    const row = await bindings.DB.prepare("SELECT r2_object_key, version FROM projects WHERE id = ?")
      .bind(project.id)
      .first<{ r2_object_key: string; version: number }>();
    expect(row?.r2_object_key).toMatch(new RegExp(`^users/${owner.id}/projects/${project.id}/[0-9a-f-]+\\.skf$`));
    expect(row?.version).toBe(2);

    const loaded = await request(`/api/cloud/projects/${project.id}`, owner.cookie);
    expect(loaded.status).toBe(200);
    expect(loaded.headers.get("X-SketchForge-Project-Version")).toBe("2");
    expect(loaded.headers.get("content-type")).toBe(SKF_MEDIA_TYPE);
    expect(loaded.headers.get("X-SketchForge-Project-Format")).toBe("skf");
    expect(new Uint8Array(await loaded.arrayBuffer())).toEqual(skf);

    const exported = await request(`/api/cloud/projects/${project.id}/export`, owner.cookie);
    expect(exported.status).toBe(200);
    expect(exported.headers.get("content-type")).toBe(SKF_MEDIA_TYPE);
    expect(exported.headers.get("content-disposition")).toContain(".skf");

    const legacyJsonSave = await request(`/api/cloud/projects/${project.id}`, owner.cookie, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-sketchforge-expected-version": "2" },
      body: JSON.stringify({ formatVersion: 1, shapes: [] }),
    });
    expect(legacyJsonSave.status).toBe(415);

    const malformed = await request(`/api/cloud/projects/${project.id}`, owner.cookie, {
      method: "PUT",
      headers: {
        "content-type": SKF_MEDIA_TYPE,
        "x-sketchforge-expected-version": "2",
      },
      body: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: "INVALID_PROJECT_FORMAT" });
    const unchanged = await bindings.DB.prepare("SELECT version FROM projects WHERE id = ?")
      .bind(project.id)
      .first<{ version: number }>();
    expect(unchanged?.version).toBe(2);
  });

  it("renames in D1 and permanently deletes project metadata plus every R2 object", async () => {
    const owner = await seedUser();
    const project = await seedProject(owner.id);
    const thumbnailKey = `users/${owner.id}/projects/${project.id}/thumbnails/1-preview.png`;
    const stalePackageKey = `users/${owner.id}/projects/${project.id}/stale-package.skf`;
    const unrelatedKey = `users/${owner.id}/projects/unrelated/keep.skf`;
    await bindings.PROJECTS.put(thumbnailKey, new Uint8Array([1, 2, 3]));
    await bindings.PROJECTS.put(stalePackageKey, new Uint8Array([4, 5, 6]));
    await bindings.PROJECTS.put(unrelatedKey, new Uint8Array([7, 8, 9]));
    await bindings.DB.prepare(
      "UPDATE projects SET thumbnail_object_key = ?, thumbnail_size_bytes = 3 WHERE id = ?",
    ).bind(thumbnailKey, project.id).run();
    await bindings.DB.prepare(
      "UPDATE users SET storage_used_bytes = storage_used_bytes + 3 WHERE id = ?",
    ).bind(owner.id).run();

    const renamed = await request(`/api/cloud/projects/${project.id}`, owner.cookie, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Renamed in Cloud" }),
    });
    expect(renamed.status).toBe(200);
    expect(await renamed.json()).toMatchObject({ ok: true, name: "Renamed in Cloud" });
    expect(await bindings.DB.prepare("SELECT name FROM projects WHERE id = ?")
      .bind(project.id)
      .first<{ name: string }>()).toEqual({ name: "Renamed in Cloud" });

    const removed = await request(`/api/cloud/projects/${project.id}`, owner.cookie, { method: "DELETE" });
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ ok: true, databaseDeleted: true, objectsDeleted: true });

    expect(await bindings.DB.prepare("SELECT id FROM projects WHERE id = ?")
      .bind(project.id)
      .first<{ id: string }>()).toBeNull();
    expect(await bindings.PROJECTS.get(project.key)).toBeNull();
    expect(await bindings.PROJECTS.get(thumbnailKey)).toBeNull();
    expect(await bindings.PROJECTS.get(stalePackageKey)).toBeNull();
    expect(await bindings.PROJECTS.get(unrelatedKey)).not.toBeNull();
    expect(await bindings.DB.prepare("SELECT storage_used_bytes, project_count FROM users WHERE id = ?")
      .bind(owner.id)
      .first<{ storage_used_bytes: number; project_count: number }>()).toEqual({
      storage_used_bytes: 0,
      project_count: 0,
    });
    expect((await request(`/api/cloud/projects/${project.id}`, owner.cookie)).status).toBe(404);
  });

  it("enforces legal acceptance and read-only billing states on the server", async () => {
    const staleLegal = await seedUser("active", { legal: false });
    expect((await request("/api/cloud/projects", staleLegal.cookie)).status).toBe(409);
    const pastDue = await seedUser("past_due", { graceEndsAt: Math.floor(Date.now() / 1000) + 3600 });
    const { id: projectId } = await seedProject(pastDue.id);
    expect((await request(`/api/cloud/projects/${projectId}`, pastDue.cookie)).status).toBe(200);
    expect((await request(`/api/cloud/projects/${projectId}/export`, pastDue.cookie)).status).toBe(200);
    const save = await request(`/api/cloud/projects/${projectId}`, pastDue.cookie, {
      method: "PUT",
      body: JSON.stringify({ formatVersion: 1, shapes: [], workspace: null, snap: null, expectedVersion: 1 }),
    });
    expect(save.status).toBe(402);
  });

  it("blocks every project-content route after the seven-day subscription grace window", async () => {
    const now = Math.floor(Date.now() / 1000);
    const canceled = await seedUser("canceled", { graceEndsAt: now - 1, periodEnd: now - 3600 });
    const { id: projectId } = await seedProject(canceled.id);
    expect((await request("/api/cloud/projects", canceled.cookie)).status).toBe(402);
    expect((await request(`/api/cloud/projects/${projectId}`, canceled.cookie)).status).toBe(402);
    expect((await request(`/api/cloud/projects/${projectId}/export`, canceled.cookie)).status).toBe(402);
    expect((await request(`/api/cloud/projects/${projectId}/thumbnail`, canceled.cookie)).status).toBe(402);
  });

  it("rejects an oversized streamed public webhook before parsing", async () => {
    const chunk = new Uint8Array(1_048_577);
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(chunk); controller.close(); } });
    const response = await SELF.fetch(`${ORIGIN}/api/cloud/stripe/webhook`, { method: "POST", body });
    expect(response.status).toBe(413);
  });

  it("permanently anonymizes account records, removes project objects, and revokes sessions", async () => {
    const account = await seedUser("active");
    const project = await seedProject(account.id);
    const orphanKey = `users/${account.id}/orphaned-upload.bin`;
    await bindings.PROJECTS.put(orphanKey, new Uint8Array([1, 2, 3]));
    const now = Math.floor(Date.now() / 1000);
    await bindings.DB.prepare(
      "INSERT INTO legal_acceptances (id, user_id, terms_version, privacy_version, accepted_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), account.id, bindings.CURRENT_TERMS_VERSION, bindings.CURRENT_PRIVACY_VERSION, now).run();

    const rejected = await request("/api/cloud/account/delete-request", account.cookie, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: account.email, confirmation: "delete" }),
    });
    expect(rejected.status).toBe(400);

    const accepted = await request("/api/cloud/account/delete-request", account.cookie, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: account.email, confirmation: "DELETE" }),
    });
    expect(accepted.status).toBe(202);
    expect(await accepted.json()).toMatchObject({ ok: true, status: "approved" });
    expect(accepted.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await request("/api/cloud/status", account.cookie)).status).toBe(401);
    const immediatelyDeletedUser = await bindings.DB.prepare(
      "SELECT google_subject, email, display_name, deleted_at FROM users WHERE id = ?",
    ).bind(account.id).first<Record<string, string | number | null>>();
    expect(immediatelyDeletedUser).toMatchObject({
      google_subject: `deleted:${account.id}`,
      email: `deleted+${account.id}@deleted.invalid`,
      display_name: null,
    });
    expect(immediatelyDeletedUser?.deleted_at).toEqual(expect.any(Number));

    await expect(processApprovedAccountDeletions(bindings)).resolves.toEqual({ enabled: true, processed: 1 });
    expect(await bindings.PROJECTS.get(project.key)).toBeNull();
    expect(await bindings.PROJECTS.get(orphanKey)).toBeNull();

    const deletedUser = await bindings.DB.prepare(
      `SELECT google_subject, email, email_verified, display_name, avatar_url, stripe_customer_id,
        storage_used_bytes, storage_allocated_bytes, project_count, deleted_at
       FROM users WHERE id = ?`,
    ).bind(account.id).first<Record<string, string | number | null>>();
    expect(deletedUser).toMatchObject({
      google_subject: `deleted:${account.id}`,
      email: `deleted+${account.id}@deleted.invalid`,
      email_verified: 0,
      display_name: null,
      avatar_url: null,
      stripe_customer_id: null,
      storage_used_bytes: 0,
      storage_allocated_bytes: 1_073_741_824,
      project_count: 0,
    });
    expect(deletedUser?.deleted_at).toEqual(expect.any(Number));

    const deletedProject = await bindings.DB.prepare(
      "SELECT name, r2_object_key, size_bytes, thumbnail_object_key, thumbnail_size_bytes, object_deletion_status, deleted_at FROM projects WHERE id = ?",
    ).bind(project.id).first<Record<string, string | number | null>>();
    expect(deletedProject).toMatchObject({
      name: "Deleted project",
      r2_object_key: `deleted/${project.id}`,
      size_bytes: 0,
      thumbnail_object_key: null,
      thumbnail_size_bytes: 0,
      object_deletion_status: "deleted",
    });
    expect(deletedProject?.deleted_at).toEqual(expect.any(Number));

    const privateRows = await bindings.DB.batch([
      bindings.DB.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?").bind(account.id),
      bindings.DB.prepare("SELECT COUNT(*) AS count FROM legal_acceptances WHERE user_id = ?").bind(account.id),
    ]);
    expect(privateRows.map((result) => (result.results[0] as { count: number }).count)).toEqual([0, 0]);
    const deletion = await bindings.DB.prepare(
      "SELECT status, last_error_code FROM account_deletion_requests WHERE user_id = ?",
    ).bind(account.id).first<{ status: string; last_error_code: string | null }>();
    expect(deletion).toEqual({ status: "completed", last_error_code: null });
  });

  it("does not process a legacy deletion request until the user reconfirms it", async () => {
    const account = await seedUser("active");
    const now = Math.floor(Date.now() / 1000);
    await bindings.DB.prepare(
      "INSERT INTO account_deletion_requests (id, user_id, requested_at, status, execute_after) VALUES (?, ?, ?, 'cancel_scheduled', ?)",
    ).bind(crypto.randomUUID(), account.id, now, now).run();

    await expect(processApprovedAccountDeletions(bindings)).resolves.toEqual({ enabled: true, processed: 0 });
    expect((await request("/api/cloud/status", account.cookie)).status).toBe(200);

    const response = await request("/api/cloud/account/delete-request", account.cookie, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: account.email, confirmation: "DELETE" }),
    });
    expect(response.status).toBe(202);
    expect((await request("/api/cloud/status", account.cookie)).status).toBe(401);
    await expect(processApprovedAccountDeletions(bindings)).resolves.toEqual({ enabled: true, processed: 1 });
  });
});
