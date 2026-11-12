import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPiBridgeClient,
  PI_BRIDGE_CLIENT_TIMEOUT_DEFAULT_MS,
  PI_BRIDGE_CLIENT_TIMEOUT_MAX_MS,
} from "./pi-bridge-client.ts";

const env = {
  PI_BRIDGE_ORIGIN: "https://bridge.example.test",
  PI_BRIDGE_TOKEN: "private-bridge-token",
  CF_ACCESS_CLIENT_ID: "access-client-id",
  CF_ACCESS_CLIENT_SECRET: "private-access-secret",
};
const responseBody = {
  ok: true,
  result: { ok: true, purpose: "pi-bridge-smoke" },
};

test("calls only the configured HTTPS smoke path with server-held secrets and no redirects", async () => {
  let seen: { input: RequestInfo | URL; init?: RequestInit } | undefined;
  const client = createPiBridgeClient(env, async (input, init) => {
    seen = { input, init };
    return new Response(JSON.stringify(responseBody), { status: 200 });
  });
  assert.deepEqual(await client.smoke(), responseBody);
  assert.equal(String(seen?.input), "https://bridge.example.test/v1/smoke");
  assert.equal(seen?.init?.method, "POST");
  assert.equal(seen?.init?.redirect, "error");
  assert.equal(seen?.init?.body, "{}");
  assert.ok(seen?.init?.signal instanceof AbortSignal);
  const headers = new Headers(seen?.init?.headers);
  assert.equal(headers.get("authorization"), `Bearer ${env.PI_BRIDGE_TOKEN}`);
  assert.equal(headers.get("cf-access-client-id"), env.CF_ACCESS_CLIENT_ID);
  assert.equal(headers.get("cf-access-client-secret"), env.CF_ACCESS_CLIENT_SECRET);
});

test("outer timeout defaults and bounds leave margin over the bridge maximum", () => {
  assert.equal(PI_BRIDGE_CLIENT_TIMEOUT_DEFAULT_MS, 65_000);
  assert.equal(PI_BRIDGE_CLIENT_TIMEOUT_MAX_MS, 125_000);
  assert.doesNotThrow(() => createPiBridgeClient(env, fetch, PI_BRIDGE_CLIENT_TIMEOUT_MAX_MS));
  assert.throws(() => createPiBridgeClient(env, fetch, PI_BRIDGE_CLIENT_TIMEOUT_MAX_MS + 1));
  assert.throws(() => createPiBridgeClient(env, fetch, 99));
});

test("rejects insecure, path-bearing, or credential-bearing origins and missing secrets", () => {
  for (const origin of [
    "http://bridge.example.test",
    "https://bridge.example.test/v1/smoke",
    "https://bridge.example.test/?next=elsewhere",
    "https://user:password@bridge.example.test",
  ]) {
    assert.throws(() => createPiBridgeClient({ ...env, PI_BRIDGE_ORIGIN: origin }));
  }
  assert.throws(() => createPiBridgeClient({ ...env, PI_BRIDGE_TOKEN: undefined }));
  assert.throws(() => createPiBridgeClient({ ...env, CF_ACCESS_CLIENT_SECRET: undefined }));
});

test("does not follow redirects and rejects remote errors or invalid structured output", async (t) => {
  await t.test("redirect", async () => {
    const client = createPiBridgeClient(env, async () => new Response(null, { status: 302 }));
    await assert.rejects(client.smoke(), /HTTP 302/);
  });
  await t.test("server error", async () => {
    const client = createPiBridgeClient(env, async () => new Response("not available", { status: 503 }));
    await assert.rejects(client.smoke(), /HTTP 503/);
  });
  await t.test("bad response", async () => {
    const client = createPiBridgeClient(env, async () => new Response(JSON.stringify({ ok: true })));
    await assert.rejects(client.smoke(), /invalid response/);
  });
  await t.test("transport errors hide details", async () => {
    const client = createPiBridgeClient(env, async () => {
      throw new Error(env.CF_ACCESS_CLIENT_SECRET);
    });
    await assert.rejects(client.smoke(), (error: Error) => !error.message.includes(env.CF_ACCESS_CLIENT_SECRET));
  });
  await t.test("timeout aborts a stalled request", async () => {
    const client = createPiBridgeClient(
      env,
      (_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("timed out")), { once: true });
      }),
      100,
    );
    await assert.rejects(client.smoke(), /unavailable/);
  });
});
