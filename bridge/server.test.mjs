import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createBridgeServer, PI_BRIDGE_TIMEOUT_DEFAULT_MS, PI_BRIDGE_TIMEOUT_MAX_MS } from "./server.mjs";
import { runPiRpc } from "./rpc.mjs";

const TOKEN = "test-bridge-token-abcdefghijklmnopqrstuvwxyz-012345";
const FIXTURE = fileURLToPath(new URL("./fixtures/mock-pi.mjs", import.meta.url));

async function setup({ mode = "success", timeoutMs = 2_000, maxStdoutBytes, runPi } = {}) {
  const children = [];
  const liveChildren = new Set();
  let maxLiveChildren = 0;
  let captured;
  const spawnImpl = (command, args, options) => {
    captured = { command, args, options };
    const childMode = typeof mode === "function" ? mode(children.length) : mode;
    const child = spawn(process.execPath, [FIXTURE], {
      cwd: options.cwd,
      env: { ...options.env, PI_MOCK_MODE: childMode },
      stdio: options.stdio,
    });
    liveChildren.add(child);
    maxLiveChildren = Math.max(maxLiveChildren, liveChildren.size);
    child.closed = new Promise((resolve) => child.once("close", (...args) => {
      liveChildren.delete(child);
      resolve(args);
    }));
    children.push(child);
    return child;
  };
  const server = createBridgeServer({
    token: TOKEN,
    piCommand: "mock-pi-is-not-executed",
    piEnv: {
      PATH: process.env.PATH,
      PI_BRIDGE_TOKEN: "must-not-reach-child",
      CF_ACCESS_CLIENT_SECRET: "also-must-not-reach-child",
    },
    timeoutMs,
    ...(maxStdoutBytes ? { maxStdoutBytes } : {}),
    ...(runPi ? { runPi } : {}),
    spawnImpl,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  return {
    server,
    base,
    children,
    get maxLiveChildren() {
      return maxLiveChildren;
    },
    get captured() {
      return captured;
    },
    async close() {
      const closed = new Promise((resolve) => server.close(resolve));
      server.closeAllConnections();
      await closed;
    },
  };
}

test("bridge timeout defaults and maximum are explicit and enforced", () => {
  assert.equal(PI_BRIDGE_TIMEOUT_DEFAULT_MS, 60_000);
  assert.equal(PI_BRIDGE_TIMEOUT_MAX_MS, 120_000);
  assert.doesNotThrow(() => createBridgeServer({ token: TOKEN, timeoutMs: PI_BRIDGE_TIMEOUT_MAX_MS }));
  assert.throws(() => createBridgeServer({ token: TOKEN, timeoutMs: PI_BRIDGE_TIMEOUT_MAX_MS + 1 }));
  assert.throws(() => createBridgeServer({ token: TOKEN, timeoutMs: 99 }));
});

function auth(token = TOKEN) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function postSmoke(base, { token = TOKEN, body = "{}", headers = {} } = {}) {
  return fetch(`${base}/v1/smoke`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json", ...headers },
    body,
  });
}

test("health requires the independent bearer token and does not enable CORS", async () => {
  const bridge = await setup();
  try {
    const denied = await fetch(`${bridge.base}/health`);
    assert.equal(denied.status, 401);
    const response = await fetch(`${bridge.base}/health`, { headers: auth() });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, service: "pi-bridge" });
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(bridge.children.length, 0);
  } finally {
    await bridge.close();
  }
});

test("rejects wrong methods, malformed JSON, non-empty objects, and oversized bodies", async () => {
  const bridge = await setup();
  try {
    const wrongMethod = await fetch(`${bridge.base}/v1/smoke`, { headers: auth() });
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get("allow"), "POST");
    assert.equal((await postSmoke(bridge.base, { body: "{" })).status, 400);
    assert.equal((await postSmoke(bridge.base, { body: '{"prompt":"anything"}' })).status, 400);
    assert.equal((await postSmoke(bridge.base, { body: "x".repeat(1025) })).status, 413);
    assert.equal(bridge.children.length, 0);
  } finally {
    await bridge.close();
  }
});

test("rejects invalid bearer tokens without starting Pi", async () => {
  const bridge = await setup();
  try {
    const response = await postSmoke(bridge.base, { token: "not-the-secret" });
    assert.equal(response.status, 401);
    assert.equal(bridge.children.length, 0);
  } finally {
    await bridge.close();
  }
});

test("smoke starts the fixed no-tools Pi RPC process and returns only its validated fixed output", async () => {
  const bridge = await setup();
  try {
    const response = await postSmoke(bridge.base);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      result: { ok: true, purpose: "pi-bridge-smoke" },
    });
    const { args, options } = bridge.captured;
    const flag = (name) => args[args.indexOf(name) + 1];
    assert.equal(flag("--mode"), "rpc");
    assert.equal(flag("--provider"), "openai-codex");
    assert.equal(flag("--model"), "gpt-6-luna");
    assert.equal(flag("--thinking"), "xhigh");
    for (const disabled of [
      "--no-session",
      "--no-tools",
      "--no-mcp",
      "--no-extensions",
      "--no-skills",
      "--no-context-files",
      "--no-prompt-templates",
      "--no-themes",
      "--no-approve",
    ]) {
      assert.ok(args.includes(disabled), `${disabled} should be passed`);
    }
    assert.deepEqual(options.stdio, ["pipe", "pipe", "ignore"]);
    assert.equal(options.env.PI_BRIDGE_TOKEN, undefined);
    assert.equal(options.env.CF_ACCESS_CLIENT_SECRET, undefined);
    assert.ok(options.cwd.includes("pi-bridge-"));
  } finally {
    await bridge.close();
  }
});

test("maps malformed RPC, invalid structured output, provider errors, and stdout overflow to generic failures", async (t) => {
  for (const [mode, limit] of [
    ["malformed-rpc", undefined],
    ["malformed-output", undefined],
    ["wrong-output", undefined],
    ["provider-error", undefined],
    ["large-output", 128 * 1024],
  ]) {
    await t.test(mode, async () => {
      const bridge = await setup({ mode, maxStdoutBytes: limit });
      try {
        const response = await postSmoke(bridge.base);
        assert.equal(response.status, 502);
        const body = await response.text();
        assert.ok(!body.includes("provider detail"));
        assert.ok(!body.includes(TOKEN));
      } finally {
        await bridge.close();
      }
    });
  }
});

test("times out and terminates a hung Pi subprocess", async () => {
  const bridge = await setup({ mode: "timeout", timeoutMs: 200 });
  try {
    const response = await postSmoke(bridge.base);
    assert.equal(response.status, 504);
    assert.equal(await bridge.children[0].closed.then(() => true), true);
  } finally {
    await bridge.close();
  }
});

test("client disconnect aborts the active Pi subprocess", async () => {
  const bridge = await setup({ mode: "slow", timeoutMs: 2_000 });
  try {
    const controller = new AbortController();
    const pending = fetch(`${bridge.base}/v1/smoke`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: "{}",
      signal: controller.signal,
    });
    while (bridge.children.length === 0) await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    await assert.rejects(pending);
    await bridge.children[0].closed;
  } finally {
    await bridge.close();
  }
});

test("holds the concurrency slot until stubborn children close after timeout or cancellation", async (t) => {
  for (const reason of ["timeout", "cancel"]) {
    await t.test(reason, async () => {
      let calls = 0;
      const runPi = (options) => {
        const timeoutMs = reason === "timeout" && calls === 0 ? 100 : 5_000;
        calls++;
        return runPiRpc({ ...options, timeoutMs });
      };
      const bridge = await setup({
        mode: (index) => (index === 0 ? "stubborn" : "success"),
        timeoutMs: 5_000,
        runPi,
      });
      try {
        const controller = new AbortController();
        const first = fetch(`${bridge.base}/v1/smoke`, {
          method: "POST",
          headers: { ...auth(), "Content-Type": "application/json" },
          body: "{}",
          ...(reason === "cancel" ? { signal: controller.signal } : {}),
        });
        while (bridge.children.length === 0) await new Promise((resolve) => setTimeout(resolve, 5));
        const second = postSmoke(bridge.base);
        if (reason === "cancel") {
          await new Promise((resolve) => setTimeout(resolve, 25));
          controller.abort();
          await assert.rejects(first);
        } else {
          assert.equal((await first).status, 504);
        }
        assert.equal((await second).status, 200);
        assert.equal(bridge.children.length, 2);
        assert.equal(bridge.maxLiveChildren, 1);
      } finally {
        await bridge.close();
      }
    });
  }
});

test("bounds concurrency and rejects requests beyond its small queue", async () => {
  const bridge = await setup({ mode: "slow", timeoutMs: 5_000 });
  try {
    const requests = Array.from({ length: 5 }, () => postSmoke(bridge.base));
    const responses = await Promise.all(requests);
    const statuses = responses.map((response) => response.status);
    assert.ok(statuses.includes(503), `expected queue rejection, got ${statuses.join(",")}`);
    assert.ok(statuses.filter((status) => status === 200).length <= 3);
    assert.ok(statuses.every((status) => status === 200 || status === 503));
  } finally {
    await bridge.close();
  }
});
