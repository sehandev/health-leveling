import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { piEnvironment, PiRpcError, runPiRpc } from "./rpc.mjs";

const MAX_REQUEST_BYTES = 1024;
const MAX_TOKEN_BYTES = 4096;
const MAX_CONCURRENCY = 1;
const MAX_QUEUE = 2;
export const PI_BRIDGE_TIMEOUT_DEFAULT_MS = 60_000;
export const PI_BRIDGE_TIMEOUT_MAX_MS = 120_000;

class HttpError extends Error {
  constructor(status, message, headers = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

class QueueFullError extends Error {}

function isAuthorized(header, token) {
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const candidate = header.slice("Bearer ".length);
  if (!candidate || Buffer.byteLength(candidate) > MAX_TOKEN_BYTES) return false;
  const actualHash = createHash("sha256").update(candidate).digest();
  const expectedHash = createHash("sha256").update(token).digest();
  return timingSafeEqual(actualHash, expectedHash);
}

function sendJson(res, status, value, extraHeaders = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

function drainAndClose(req, res, error) {
  req.resume();
  sendJson(res, error.status, { error: error.message }, { Connection: "close", ...error.headers });
}

async function readSmokeBody(req) {
  const contentType = String(req.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new HttpError(400, "Expected an empty JSON object.");

  const declaredLength = Number(req.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new HttpError(413, "Request body is too large.");
  }

  const chunks = [];
  let size = 0;
  let tooLarge = false;
  for await (const chunk of req) {
    if (tooLarge) continue;
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) {
      tooLarge = true;
      chunks.length = 0;
    } else {
      chunks.push(chunk);
    }
  }
  if (tooLarge) throw new HttpError(413, "Request body is too large.");

  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Expected an empty JSON object.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 0) {
    throw new HttpError(400, "Expected an empty JSON object.");
  }
}

function createLimiter(concurrency, maxQueue) {
  let active = 0;
  const queue = [];

  const start = (entry) => {
    entry.started = true;
    entry.signal.removeEventListener("abort", entry.onAbort);
    active++;
    Promise.resolve()
      .then(entry.task)
      .then(entry.resolve, entry.reject)
      .finally(() => {
        active--;
        while (active < concurrency && queue.length) {
          const next = queue.shift();
          if (next.signal.aborted) {
            next.signal.removeEventListener("abort", next.onAbort);
            next.reject(next.signal.reason ?? new PiRpcError("cancelled"));
          } else {
            start(next);
          }
        }
      });
  };

  return (task, signal) =>
    new Promise((resolve, reject) => {
      if (signal.aborted) return reject(signal.reason ?? new PiRpcError("cancelled"));
      const entry = { task, signal, resolve, reject, started: false };
      entry.onAbort = () => {
        const index = queue.indexOf(entry);
        if (index !== -1) {
          queue.splice(index, 1);
          signal.removeEventListener("abort", entry.onAbort);
          reject(signal.reason ?? new PiRpcError("cancelled"));
        }
      };
      if (active < concurrency) return start(entry);
      if (queue.length >= maxQueue) return reject(new QueueFullError());
      queue.push(entry);
      signal.addEventListener("abort", entry.onAbort, { once: true });
    });
}

function requestPath(req) {
  if (typeof req.url !== "string" || !req.url.startsWith("/")) return null;
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    return url.search || url.hash ? null : url.pathname;
  } catch {
    return null;
  }
}

export function createBridgeServer({
  token = process.env.PI_BRIDGE_TOKEN,
  host = "127.0.0.1",
  port = 4317,
  piCommand = process.env.PI_CLI_BIN ?? "pi",
  piEnv = process.env,
  timeoutMs = Number(process.env.PI_BRIDGE_TIMEOUT_MS ?? PI_BRIDGE_TIMEOUT_DEFAULT_MS),
  maxStdoutBytes = 256 * 1024,
  spawnImpl,
  runPi = runPiRpc,
} = {}) {
  if (typeof token !== "string" || Buffer.byteLength(token) < 32) {
    throw new Error("PI_BRIDGE_TOKEN must contain at least 32 bytes.");
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > PI_BRIDGE_TIMEOUT_MAX_MS) {
    throw new Error("PI_BRIDGE_TIMEOUT_MS must be between 100 and 120000.");
  }
  const limitedRun = createLimiter(MAX_CONCURRENCY, MAX_QUEUE);

  const server = createServer({ maxHeaderSize: 8192 }, async (req, res) => {
    const path = requestPath(req);
    if (path !== "/health" && path !== "/v1/smoke") {
      return sendJson(res, 404, { error: "Not found." });
    }
    if (!isAuthorized(req.headers.authorization, token)) {
      return sendJson(res, 401, { error: "Unauthorized." }, { "WWW-Authenticate": "Bearer" });
    }
    if ((path === "/health" && req.method !== "GET") || (path === "/v1/smoke" && req.method !== "POST")) {
      req.resume();
      return sendJson(res, 405, { error: "Method not allowed." }, { Allow: path === "/health" ? "GET" : "POST", Connection: "close" });
    }
    if (path === "/health") return sendJson(res, 200, { ok: true, service: "pi-bridge" });

    try {
      await readSmokeBody(req);
    } catch (error) {
      if (error instanceof HttpError) return drainAndClose(req, res, error);
      return sendJson(res, 400, { error: "Invalid request." });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new PiRpcError("timeout")), timeoutMs);
    const abortIfDisconnected = () => {
      if (!res.writableEnded) controller.abort(new PiRpcError("cancelled"));
    };
    req.once("aborted", abortIfDisconnected);
    res.once("close", abortIfDisconnected);

    let workDir;
    try {
      workDir = await mkdtemp(join(tmpdir(), "pi-bridge-"));
      const result = await limitedRun(
        () => runPi({
          command: piCommand,
          cwd: workDir,
          env: piEnvironment(piEnv),
          signal: controller.signal,
          timeoutMs,
          maxStdoutBytes,
          ...(spawnImpl ? { spawnImpl } : {}),
        }),
        controller.signal,
      );
      if (!res.destroyed) sendJson(res, 200, { ok: true, result });
    } catch (error) {
      if (res.destroyed || controller.signal.reason?.kind === "cancelled") return;
      if (error instanceof QueueFullError) {
        return sendJson(res, 503, { error: "Bridge is busy." }, { "Retry-After": "1" });
      }
      if (error?.kind === "timeout" || controller.signal.reason?.kind === "timeout") {
        return sendJson(res, 504, { error: "Pi request timed out." });
      }
      return sendJson(res, 502, { error: "Pi request failed." });
    } finally {
      clearTimeout(timeout);
      req.removeListener("aborted", abortIfDisconnected);
      res.removeListener("close", abortIfDisconnected);
      if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 2_000;
  server.maxRequestsPerSocket = 100;
  server.host = host;
  server.port = port;
  return server;
}

export function startBridgeServer(env = process.env) {
  const host = env.PI_BRIDGE_HOST ?? "127.0.0.1";
  const port = Number(env.PI_BRIDGE_PORT ?? 4317);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("PI_BRIDGE_PORT is invalid.");
  const server = createBridgeServer({
    token: env.PI_BRIDGE_TOKEN,
    host,
    port,
    piCommand: env.PI_CLI_BIN ?? "pi",
    piEnv: piEnvironment(env),
    timeoutMs: Number(env.PI_BRIDGE_TIMEOUT_MS ?? PI_BRIDGE_TIMEOUT_DEFAULT_MS),
  });
  server.listen(port, host);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const server = startBridgeServer();
    const shutdown = () => server.close(() => process.exit(0));
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    server.on("error", () => {
      process.stderr.write("Pi bridge failed to start or listen.\n");
      process.exitCode = 1;
    });
  } catch {
    process.stderr.write("Pi bridge configuration is invalid.\n");
    process.exitCode = 1;
  }
}
