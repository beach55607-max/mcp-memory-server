# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly:

1. **Do NOT open a public GitHub issue** for security vulnerabilities
2. Email: beach55607@gmail.com with subject line `[SECURITY] mcp-memory-server`
3. Include: description, reproduction steps, potential impact

You will receive a response within 72 hours. We will work with you to understand and address the issue before any public disclosure.

## Security Model

This server is designed for **single-user, personal use**. The security model assumes:

- One person owns and operates the server
- The Cloudflare account owner is the sole user
- OAuth 2.1 provides client authentication (not multi-user auth)

### What IS protected

- **MCP endpoint** (`/mcp`): OAuth 2.1 with PKCE (S256 only)
- **REST API** (`/api/*`): Shared secret (`API_SECRET`) required in production
- **CORS**: Origin allowlist (no wildcard), configurable via `ALLOWED_ORIGINS`
- **Input**: Content sanitized (script/iframe/object/embed/event handlers/javascript: URI stripped)
- **IDs**: SHA-256 deterministic hashing, validated format on delete

### What is NOT protected

- **No multi-user isolation**: All memories are in one D1 database
- **No rate limiting in code**: Relies on Cloudflare Workers platform limits (100K requests/day on free plan). For additional protection, configure [Cloudflare Rate Limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- **No encryption at rest**: D1 stores content in plaintext (Cloudflare manages infrastructure encryption)
- **Sanitization is not exhaustive**: Strips common XSS vectors but not a full HTML sanitizer. The server returns JSON, not HTML — sanitization is defense-in-depth

### Environment Variables

| Variable | Security Impact |
|----------|----------------|
| `API_SECRET` | **Required in production.** Set via `wrangler secret put API_SECRET`. Without it, REST API is open |
| `DEV_MODE` | **Never enable in production.** Bypasses API_SECRET check and allows localhost CORS |
| `ALLOWED_ORIGINS` | Configure to restrict which websites can call your API. Empty = no cross-origin access allowed |

## Supported Versions

Only the latest version on `master` branch receives security updates.
