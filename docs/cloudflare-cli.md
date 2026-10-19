# Cloudflare CLI and Local Pi Bridge

## Decision

Use the installed Cloudflare `cf` CLI as the primary Cloudflare operations CLI. Do not treat `cf` as an alias for Wrangler. The current development Mac reports `cf v1.0.0-beta.18`; pin the CLI version in repeatable setup instructions while it remains beta.

The intended AI prototype path is:

```text
Cloudflare Worker
  → HTTPS hostname protected by Cloudflare Access
  → Cloudflare Tunnel
  → local HTTP bridge on the development Mac
  → Pi CLI in RPC mode (JSONL over stdin/stdout)
```

Cloudflare Workers cannot directly run the Pi Node.js/Bun SDK or reach a Mac-local process. Pi RPC is a process protocol, not a network listener, so the bridge is required. The bridge translates a narrow set of application requests into Pi RPC operations.

## `cf` and Wrangler

- **`cf`** is the chosen Cloudflare CLI for this project. Its command groups cover Workers, D1, R2, Tunnels, Access, and other Cloudflare resources.
- **Wrangler** is a separate, established Cloudflare development/deployment CLI. It is not the project's default CLI. Use it only if a required workflow is missing from `cf`, and document that exception rather than silently mixing tools.
- The installed `cf` command provides resource discovery through `cf cli search` and documentation discovery through `cf docs search`.
- `cf` is currently beta, so commands and flags may change. Pin its version and verify workflows when upgrading.

Relevant command groups discovered in the installed CLI include:

- `cf tunnels ...` — create/configure tunnels, retrieve tokens, and run a tunnel. `cf tunnels run` uses a `cf`-managed `cloudflared` binary.
- `cf zero-trust access ...` — manage Access applications, policies, and Service Tokens.
- `cf workers ...`, `cf deploy`, and `cf workers secrets ...` — manage/deploy Workers and set Worker secrets.
- `cf d1 ...` and `cf r2 ...` — manage D1 and R2 resources.

A temporary `cf tunnels quick-start` tunnel is useful for a smoke test, not as the persistent hostname for the app.

## Tunnel vs. Mesh

Use **Cloudflare Tunnel** for the Worker-to-Mac HTTP path. The Mac initiates the outbound tunnel connection; the Worker calls the configured HTTPS hostname.

Cloudflare Mesh is for private IP connectivity among enrolled devices. A deployed Worker is not itself a Mesh participant, so Mesh does not provide a direct Worker-to-Mac route for this design.

## Bridge and Access Boundaries

- Run the bridge and Pi locally on the Mac, initially through a project script such as `pnpm dev:pi-bridge`.
- Do not expose the raw Pi RPC protocol or an unrestricted agent-control endpoint through the tunnel. Expose only the application operations the product needs.
- Protect the hostname with Cloudflare Access. Keep the Service Token in Worker secrets; do not commit credentials or place them in browser code.
- Keep the bridge available while the Mac is awake and connected. This can support the private single-user initial release, but AI will be unavailable when the Mac or Tunnel is offline; it is not a highly available multi-user runtime.
- Running Pi locally does not guarantee that inference stays on the Mac. The configured model provider may receive prompts, including health-related data; the provider and data-sharing behavior remain to be decided.

## Not Yet Decided

- The bridge's HTTP API shape and whether it will use Pi CLI RPC directly or the Pi SDK behind a local Node.js/Bun process.
- How the TanStack Start project will build and deploy with the current `cf` CLI; validate the integration before implementation.
- The eventual production AI runtime, availability expectations, and health-data handling policy.
