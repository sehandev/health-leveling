import { spawn } from "node:child_process";
export const PI_SMOKE_RESULT = Object.freeze({ ok: true, purpose: "pi-bridge-smoke" });
export const PI_SMOKE_PROMPT =
  'Return exactly this JSON object and no other text: {"ok":true,"purpose":"pi-bridge-smoke"}';

const SYSTEM_PROMPT =
  "You are a fixed smoke-check responder. Follow the user's exact response format; do not use tools.";
const PROMPT_ID = "pi-bridge-smoke";
const MAX_LINE_BYTES = 64 * 1024;
const TERMINATION_GRACE_MS = 500;

export class PiRpcError extends Error {
  constructor(kind) {
    super(kind);
    this.name = "PiRpcError";
    this.kind = kind;
  }
}

export function piArgs() {
  return [
    "--mode",
    "rpc",
    "--no-session",
    "--provider",
    "openai-codex",
    "--model",
    "gpt-6-luna",
    "--thinking",
    "xhigh",
    "--system-prompt",
    SYSTEM_PROMPT,
    "--no-tools",
    "--no-mcp",
    "--no-extensions",
    "--no-skills",
    "--no-context-files",
    "--no-prompt-templates",
    "--no-themes",
    "--no-approve",
  ];
}

export function piEnvironment(source = process.env) {
  const allowed = [
    "PATH",
    "HOME",
    "USERPROFILE",
    "TMPDIR",
    "TEMP",
    "TMP",
    "PI_CODING_AGENT_DIR",
    "OPENAI_API_KEY",
  ];
  return Object.fromEntries(allowed.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
}

function parseRpcOutput(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new PiRpcError("invalid-output");
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2 ||
    value.ok !== true ||
    value.purpose !== PI_SMOKE_RESULT.purpose
  ) {
    throw new PiRpcError("invalid-output");
  }
  return PI_SMOKE_RESULT;
}

function finalText(message) {
  if (!message || message.role !== "assistant") throw new PiRpcError("invalid-output");
  if (message.stopReason === "error" || message.stopReason === "aborted") {
    throw new PiRpcError("provider-error");
  }
  if (message.stopReason !== "stop") throw new PiRpcError("invalid-output");
  const content = Array.isArray(message.content) ? message.content : [];
  if (content.some((block) => block?.type === "toolCall")) throw new PiRpcError("invalid-output");
  const text = content.filter((block) => block?.type === "text").map((block) => block.text).join("");
  if (!text) throw new PiRpcError("invalid-output");
  return text;
}

function waitForCloseOrTimeout(closePromise, timeoutMs) {
  let timer;
  return Promise.race([
    closePromise.then(() => true),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function terminateChild(child, closePromise, isClosed) {
  if (isClosed()) return;
  if (child.exitCode === null && child.signalCode === null) {
    try {
      child.kill("SIGTERM");
    } catch {
      // Still wait for close; a later SIGKILL may be needed.
    }
    if (await waitForCloseOrTimeout(closePromise, TERMINATION_GRACE_MS)) return;
    try {
      child.kill("SIGKILL");
    } catch {
      // Keep the request slot until the close event confirms the child is gone.
    }
  }
  if (!isClosed()) await closePromise;
}

export function runPiRpc({
  command = "pi",
  cwd,
  env = piEnvironment(),
  signal,
  timeoutMs = 60_000,
  maxStdoutBytes = 256 * 1024,
  spawnImpl = spawn,
} = {}) {
  if (signal?.aborted) return Promise.reject(new PiRpcError("cancelled"));

  let child;
  try {
    child = spawnImpl(command, piArgs(), {
      cwd,
      env,
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true,
    });
  } catch {
    return Promise.reject(new PiRpcError("launch-error"));
  }

  return new Promise((resolve, reject) => {
    let finished = false;
    let closeObserved = false;
    let resolveClose;
    const closePromise = new Promise((resolve) => {
      resolveClose = resolve;
    });
    let accepted = false;
    let settled = false;
    let assistantMessage;
    let outputBytes = 0;
    let lineBuffer = Buffer.alloc(0);

    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    };
    const fail = (error) => {
      if (finished) return;
      finished = true;
      cleanup();
      const failure = error instanceof PiRpcError ? error : new PiRpcError("protocol-error");
      terminateChild(child, closePromise, () => closeObserved).then(
        () => reject(failure),
        () => reject(new PiRpcError("cleanup-error")),
      );
    }
    const complete = (code, signalCode) => {
      if (finished) return;
      if (code !== 0 || signalCode) return fail(new PiRpcError("process-error"));
      if (!accepted || !settled || !assistantMessage) return fail(new PiRpcError("incomplete-run"));
      try {
        const result = parseRpcOutput(finalText(assistantMessage));
        finished = true;
        cleanup();
        resolve(result);
      } catch (error) {
        fail(error);
      }
    };
    const onAbort = () => fail(new PiRpcError(signal?.reason?.kind === "timeout" ? "timeout" : "cancelled"));
    const timeout = setTimeout(() => fail(new PiRpcError("timeout")), timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });

    const handleRecord = (line) => {
      let record;
      try {
        record = JSON.parse(line.toString("utf8"));
      } catch {
        throw new PiRpcError("protocol-error");
      }
      if (!record || typeof record !== "object" || typeof record.type !== "string") {
        throw new PiRpcError("protocol-error");
      }
      if (record.type === "response") {
        if (record.id !== PROMPT_ID || record.command !== "prompt" || accepted) {
          throw new PiRpcError("protocol-error");
        }
        if (!record.success || record.data?.disposition !== "started") {
          throw new PiRpcError("prompt-rejected");
        }
        accepted = true;
        return;
      }
      if (record.type === "message_end" && record.message?.role === "assistant") {
        assistantMessage = record.message;
        if (assistantMessage.stopReason === "error" || assistantMessage.stopReason === "aborted") {
          throw new PiRpcError("provider-error");
        }
        return;
      }
      if (record.type === "agent_settled") {
        if (record.aborted) throw new PiRpcError("provider-error");
        settled = true;
        child.stdin.end();
      }
      if (record.type.startsWith("extension_ui_")) throw new PiRpcError("protocol-error");
    };

    child.on("error", () => fail(new PiRpcError("launch-error")));
    child.stdin.on("error", () => fail(new PiRpcError("protocol-error")));
    child.stdout.on("error", () => fail(new PiRpcError("protocol-error")));
    child.stdout.on("data", (chunk) => {
      if (finished) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      outputBytes += bytes.length;
      if (outputBytes > maxStdoutBytes) return fail(new PiRpcError("output-limit"));
      lineBuffer = Buffer.concat([lineBuffer, bytes]);
      let newline;
      while ((newline = lineBuffer.indexOf(0x0a)) !== -1) {
        let line = lineBuffer.subarray(0, newline);
        lineBuffer = lineBuffer.subarray(newline + 1);
        if (line.at(-1) === 0x0d) line = line.subarray(0, -1);
        try {
          handleRecord(line);
        } catch (error) {
          fail(error);
          return;
        }
      }
      if (lineBuffer.length > MAX_LINE_BYTES) fail(new PiRpcError("output-limit"));
    });
    child.on("close", (code, signalCode) => {
      closeObserved = true;
      resolveClose();
      if (!finished) {
        if (lineBuffer.length) return fail(new PiRpcError("protocol-error"));
        complete(code, signalCode);
      }
    });
    const promptCommand = JSON.stringify({ id: PROMPT_ID, type: "prompt", message: PI_SMOKE_PROMPT }) + "\n";
    try {
      child.stdin.write(promptCommand);
    } catch {
      fail(new PiRpcError("protocol-error"));
    }
  });
}
