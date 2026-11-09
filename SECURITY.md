# Security

## Update pipeline

Pi Session Manager can check for and install updates automatically (Settings -> Updates -> "Automatic updates", enabled by default, checks every 30 minutes). This is the complete list of hosts the update pipeline contacts:

| Endpoint | Role | When |
| --- | --- | --- |
| `raw.githubusercontent.com` | update manifest (fresh) | every check |
| `cdn.jsdelivr.net` | update manifest (CDN fallback) | when the first endpoint fails |
| `github.com` | release asset download | only when installing an update |
| `jsp.dwsy.link` | optional third-party CORS proxy | only when the update proxy is enabled (default: **off**) |

### The update proxy (`jsp.dwsy.link`)

- **What it is**: a personal Cloudflare Worker CORS proxy (operated by the repository owner) that relays the two manifest endpoints above for networks where GitHub is unreachable.
- **What it sees**: your IP address and the update-check cadence. The update flow carries no credentials.
- **What it cannot do**: tamper with updates. Desktop updates are verified against a pinned minisign public key and CLI updates against published SHA256 checksums before installation. The worst case a malicious or compromised proxy can achieve is serving a stale manifest (delaying or denying an update check).
- **How it is controlled**: off by default. Enable it in Settings -> Updates -> "Use update proxy (jsp.dwsy.link)", or pass `--use-proxy` to `pi-session-cli update check|install`. The proxy requires a special `Referer` value; PSM sends that header only to `jsp.dwsy.link`, never to other hosts.
- **Note**: release downloads always go directly to `github.com` URLs from the manifest, even when the proxy is enabled.
- Standard `HTTP_PROXY`/`HTTPS_PROXY` environment variables are honored by the underlying HTTP clients.

## Local server

The optional headless server binds to `127.0.0.1` with bearer-token authentication by default and sends `Access-Control-Allow-Origin: *`. Only pass `--no-auth --bind 0.0.0.0` on networks you trust.

## Telemetry

PSM contains no analytics, crash reporting, or usage telemetry. Session content stays on your machine except for features you explicitly enable (e.g. model providers you configure yourself).
