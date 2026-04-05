/**
 * Input sanitization — strip dangerous content to prevent XSS if content is ever rendered.
 * D1 parameterized queries already prevent SQL injection.
 * Note: This is defense-in-depth. The server returns JSON, not HTML.
 */

const SCRIPT_RE = /<script[\s\S]*?<\/script>/gi;
const IFRAME_RE = /<iframe[\s\S]*?(<\/iframe>|\/?>)/gi;
const OBJECT_RE = /<object[\s\S]*?(<\/object>|\/?>)/gi;
const EMBED_RE = /<embed[\s\S]*?\/?\s*>/gi;
const EVENT_HANDLER_RE = /\bon\w+\s*=\s*["'][^"']*["']/gi;
const JAVASCRIPT_URI_RE = /\bhref\s*=\s*["']javascript:[^"']*["']/gi;
const DATA_URI_RE = /\bsrc\s*=\s*["']data:text\/html[^"']*["']/gi;

/** Strip dangerous executable content, but preserve structural HTML tags.
 *  Memory content may contain legitimate code snippets (JSX, HTML docs).
 *  Only remove content that could execute in a browser context. */
export function sanitizeContent(text: string): string {
  return text
    .replace(SCRIPT_RE, '')
    .replace(IFRAME_RE, '')
    .replace(OBJECT_RE, '')
    .replace(EMBED_RE, '')
    .replace(EVENT_HANDLER_RE, '')
    .replace(JAVASCRIPT_URI_RE, '')
    .replace(DATA_URI_RE, '');
}

/** Validate UUID v4 format (loose: accepts any hex UUID) */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(value: string): boolean {
  return UUID_RE.test(value);
}
