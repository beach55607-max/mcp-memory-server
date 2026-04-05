/**
 * OAuth authorize handler — single-user auto-approve with origin allowlist.
 * Only trusted redirect_uri origins are auto-approved.
 */

// Trusted redirect URI origins — add your AI platform domains here
const PROD_ORIGINS = [
  'https://claude.ai',
  'https://console.anthropic.com',
  'https://chatgpt.com',
  'https://chat.openai.com',
];
const DEV_ORIGINS = [
  'http://localhost',
  'http://127.0.0.1',
];

function isTrustedRedirectUri(uri: string, devMode: boolean): boolean {
  const origins = devMode ? [...PROD_ORIGINS, ...DEV_ORIGINS] : PROD_ORIGINS;
  try {
    const url = new URL(uri);
    return origins.some(origin => {
      const trusted = new URL(origin);
      return url.hostname === trusted.hostname && url.protocol === trusted.protocol;
    });
  } catch {
    return false;
  }
}

export async function handleAuthorize(
  request: Request,
  env: any,
): Promise<Response> {
  const oauthReqInfo = await env.OAUTH_PROVIDER.parseAuthRequest(request);

  if (!oauthReqInfo.clientId) {
    return new Response('Missing client_id', { status: 400 });
  }
  if (!oauthReqInfo.codeChallenge) {
    return new Response('Missing code_challenge (PKCE required)', { status: 400 });
  }

  const devMode = env.DEV_MODE === 'true';
  if (!oauthReqInfo.redirectUri || !isTrustedRedirectUri(oauthReqInfo.redirectUri, devMode)) {
    return new Response('Unauthorized redirect_uri', { status: 403 });
  }

  // Single-user: auto-approve with validated scopes only
  const ALLOWED_SCOPES = ['memory:read', 'memory:write'];
  const requested = oauthReqInfo.scope?.length ? oauthReqInfo.scope : ALLOWED_SCOPES;
  const scopes = requested.filter((s: string) => ALLOWED_SCOPES.includes(s));
  if (scopes.length === 0) {
    return new Response('No valid scopes requested', { status: 400 });
  }
  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: 'single-user',
    metadata: { autoApproved: true },
    scope: scopes,
    props: { userId: 'single-user' },
  });

  return new Response(null, {
    status: 302,
    headers: { Location: redirectTo },
  });
}
