// Server-only: call from Worker/server handlers; never import this module into client bundles.

export const PI_BRIDGE_CLIENT_TIMEOUT_DEFAULT_MS = 65_000;
export const PI_BRIDGE_CLIENT_TIMEOUT_MAX_MS = 125_000;

export interface PiBridgeEnvironment {
  PI_BRIDGE_ORIGIN?: string;
  PI_BRIDGE_TOKEN?: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
}

export interface PiSmokeResult {
  ok: true;
  result: {
    ok: true;
    purpose: "pi-bridge-smoke";
  };
}

export class PiBridgeClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PiBridgeClientError";
  }
}

function configuredOrigin(value: string | undefined): URL {
  if (!value) throw new PiBridgeClientError("Pi bridge is not configured.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PiBridgeClientError("Pi bridge is not configured.");
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new PiBridgeClientError("Pi bridge origin must be an HTTPS origin.");
  }
  return url;
}

function isSmokeResult(value: unknown): value is PiSmokeResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const response = value as Record<string, unknown>;
  if (response.ok !== true || Object.keys(response).length !== 2 || !response.result) return false;
  if (typeof response.result !== "object" || Array.isArray(response.result)) return false;
  const result = response.result as Record<string, unknown>;
  return result.ok === true && result.purpose === "pi-bridge-smoke" && Object.keys(result).length === 2;
}

export function createPiBridgeClient(
  env: PiBridgeEnvironment,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = PI_BRIDGE_CLIENT_TIMEOUT_DEFAULT_MS,
) {
  const origin = configuredOrigin(env.PI_BRIDGE_ORIGIN);
  const token = env.PI_BRIDGE_TOKEN;
  const accessId = env.CF_ACCESS_CLIENT_ID;
  const accessSecret = env.CF_ACCESS_CLIENT_SECRET;
  if (!token || !accessId || !accessSecret) {
    throw new PiBridgeClientError("Pi bridge credentials are not configured.");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > PI_BRIDGE_CLIENT_TIMEOUT_MAX_MS) {
    throw new PiBridgeClientError("Pi bridge timeout is invalid.");
  }
  const endpoint = new URL("/v1/smoke", origin);

  return {
    async smoke(): Promise<PiSmokeResult> {
      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          redirect: "error",
          headers: {
            Authorization: `Bearer ${token}`,
            "CF-Access-Client-Id": accessId,
            "CF-Access-Client-Secret": accessSecret,
            "Content-Type": "application/json",
          },
          body: "{}",
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new PiBridgeClientError("Pi bridge is unavailable.");
      }
      if (!response.ok) throw new PiBridgeClientError(`Pi bridge returned HTTP ${response.status}.`);
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new PiBridgeClientError("Pi bridge returned an invalid response.");
      }
      if (!isSmokeResult(payload)) throw new PiBridgeClientError("Pi bridge returned an invalid response.");
      return payload;
    },
  };
}
