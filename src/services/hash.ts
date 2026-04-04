/**
 * Deterministic ID generation
 * id = sha256("v1\0" + type + "\0" + title + "\0" + repo + "\0" + session_id + "\0" + fullContent)
 */

export async function generateId(
  type: string,
  title: string,
  content: string,
  repo?: string | null,
  sessionId?: string | null,
): Promise<string> {
  const payload = `v1\0${type}\0${title}\0${repo || ''}\0${sessionId || ''}\0${content}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
