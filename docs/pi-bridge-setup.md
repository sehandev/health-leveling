# Local Pi HTTP Bridge Feasibility Slice

This is a deliberately narrow smoke path, not app AI functionality. The bridge exposes only `GET /health` and `POST /v1/smoke`; both require the bridge's independent bearer token. The smoke request accepts only `{}` and Pi receives a fixed harmless prompt asking for `{"ok":true,"purpose":"pi-bridge-smoke"}`. It cannot accept prompts, health records, shell commands, model choices, working directories, or URLs.

```text
Worker (server only)
  → configured HTTPS origin protected by Cloudflare Access
  → Cloudflare Tunnel
  → 127.0.0.1:4317 local HTTP bridge
  → fresh `pi --mode rpc --no-session` subprocess
```

The bridge launches Pi with explicit `openai-codex` / `gpt-6-luna` / `xhigh` settings and disables tools, MCP, extensions, skills, context-file discovery, prompt templates, themes, and project-local approval. It validates RPC JSONL through `agent_settled`, checks the final structured response, and never writes prompts, credentials, health data, provider output, or stderr to logs. Each smoke starts a fresh temporary working directory and an in-memory no-session process. The bridge timeout defaults to 60 seconds (maximum 120 seconds); the server-only Worker client defaults to 65 seconds (maximum 125 seconds), leaving five seconds for response/transport overhead. When raising the bridge timeout, configure the Worker client timeout to at least five seconds higher, up to its 125-second maximum. Cancellation sends `SIGTERM`, escalates once to `SIGKILL` after 500 ms if needed, and holds the concurrency slot until the subprocess `close` event. The process is limited to one active request, two queued requests, a 1 KiB request body, and a 256 KiB Pi stdout stream.

Pi still uses the local user's provider authentication, and inference for this configured model goes to OpenAI Codex. Do not send real health data through this smoke endpoint. Any later feature that processes untrusted source data must keep Pi tools off and add its own constrained operation and structured validation; this bridge has no input field for source data.

## Local setup and smoke checks

Requirements: Node.js 24 and the project Pi CLI installation/authentication for `openai-codex` / `gpt-6-luna`. Generate a separate high-entropy bridge token; do not reuse a Pi, Cloudflare, or application credential.

```sh
export PI_BRIDGE_TOKEN="$(openssl rand -hex 32)"
pnpm dev:pi-bridge
```

The local listener defaults to loopback only. In another terminal, using the same environment variable:

```sh
curl --fail-with-body -sS http://127.0.0.1:4317/health \
  -H "Authorization: Bearer $PI_BRIDGE_TOKEN"

curl --fail-with-body -sS http://127.0.0.1:4317/v1/smoke \
  -H "Authorization: Bearer $PI_BRIDGE_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{}'
```

The smoke response is exactly shaped as `{"ok":true,"result":{"ok":true,"purpose":"pi-bridge-smoke"}}`. Use the bridge token only in the local server/Worker environment; do not put it in browser code, query strings, source control, or logs.

Run the mocked RPC and Worker-client tests without invoking an external provider:

```sh
node --experimental-strip-types --test bridge/pi-bridge.test.ts
```

| Variable | Used by | Default / requirement |
| --- | --- | --- |
| `PI_BRIDGE_TOKEN` | Local bridge | Required; at least 32 bytes, independent bearer secret |
| `PI_BRIDGE_HOST` | Local bridge | `127.0.0.1`; do not bind publicly |
| `PI_BRIDGE_PORT` | Local bridge | `4317` |
| `PI_CLI_BIN` | Local bridge | `pi`; trusted local executable path, never request-controlled |
| `PI_BRIDGE_TIMEOUT_MS` | Local bridge | `60000` (100–120000 ms) |
| `PI_BRIDGE_ORIGIN` | Worker server only | Required HTTPS origin only, with no path/query/fragment |
| `PI_BRIDGE_TOKEN` | Worker server only | Required secret; same independent bridge bearer token |
| `CF_ACCESS_CLIENT_ID` | Worker server only | Required Access service-token client ID secret |
| `CF_ACCESS_CLIENT_SECRET` | Worker server only | Required Access service-token client secret |

The Pi subprocess receives only the small set of local runtime/provider environment variables it needs; bridge and Cloudflare secrets are not passed to it. Pi's standard local authentication/config directory is still used to resolve the configured model's credentials.

## Cloudflare Tunnel and Access setup

The CLI commands below were discovered earlier with **`cf v1.0.0-beta.18`**, the version selected in [Cloudflare CLI and Local Pi Bridge](cloudflare-cli.md); this follow-up observed installed `cf v1.0.0-beta.29`. No Cloudflare resource commands were run or account resources, credentials, Worker deployments, or tunnel configuration changed during this follow-up. Because `cf` is beta, re-check command help after upgrading it.

The discovered CLI commands and flags were:

```sh
cf tunnels create --config-source cloudflare --name <tunnel-name>
cf tunnels run <tunnel-name>
cf zero-trust access service-tokens create --name <service-token-name>
```

`cf tunnels create --help` confirms the `cloudflare` remote-configuration choice and `--name`; `cf tunnels run --help` confirms a named tunnel positional argument. Create/configure a remotely managed tunnel using the first command. In Cloudflare Zero Trust, add a published application hostname for a dedicated bridge hostname and point its service URL at `http://127.0.0.1:4317` on the Mac. Keep the service URL distinct from the public HTTPS hostname. Then run the tunnel on that same Mac using the second command. Do not use a temporary quick tunnel as a persistent hostname.

Create a self-hosted Access application for that dedicated bridge hostname and add a **Service Auth** policy that includes the service token created by the third command. Cloudflare's service-token workflow returns the client secret only at creation; save both client ID and secret directly into the server-side Worker secret store. Do not display, commit, or send them to a browser. CLI discovery exposed `cf workers secrets update <name>` and its `--worker`, `--type`, and `--text` options, but this setup does not run that command or put secret values on a command line; use the trusted deployment secret workflow for the Worker instead. Cloudflare documents the service-token headers as `CF-Access-Client-Id` and `CF-Access-Client-Secret`.

The Worker caller reads `PI_BRIDGE_ORIGIN`, `PI_BRIDGE_TOKEN`, `CF_ACCESS_CLIENT_ID`, and `CF_ACCESS_CLIENT_SECRET` only from server bindings/secrets. It sends the Access service-token headers and independent `Authorization: Bearer …` header to the fixed `/v1/smoke` path, requires HTTPS, rejects redirect responses, and uses a bounded timeout. It has no caller-selected URL or arbitrary path. Do not import `src/ai/pi-bridge-client.ts` into a browser/client bundle.

Cloudflare Access protects the Worker-to-bridge hostname only. It does **not** add app-user login or change the MVP decision to keep the deployed app publicly accessible until access management is added shortly before completion. The bridge bearer token is defense in depth, not a replacement for Access. Keep the bridge on a separate hostname and do not expose raw Pi RPC.

## What this does not verify

The automated tests use a local Node subprocess fixture that speaks mocked Pi RPC JSONL; no health data is used. Exactly one authenticated localhost `POST /v1/smoke` was also sent to the actual installed Pi with `openai-codex` / `gpt-6-luna` / `xhigh`; it returned HTTP 200 and `{"ok":true,"result":{"ok":true,"purpose":"pi-bridge-smoke"}}`. No Cloudflare credentials were inspected, no Tunnel was created, no Access policy was changed, and no deployed Worker → Access → Tunnel → Mac path was tested, so that end-to-end route remains unverified and needs separate authorization.
