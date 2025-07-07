// src/lib/session-store.ts

interface SessionRecord {
  commentId: string;
  expiresAt: number;
}

// This Map will act as our in-memory store.
// A global variable in a module scope will persist across different serverless function invocations
// within the same container instance. This is suitable for short-lived, non-critical data.
const sessionStore = new Map<string, SessionRecord>();

const EXPIRATION_TIME_MS = 15 * 60 * 1000; // 15 minutes

export function saveSession(psid: string, commentId: string) {
  const expiresAt = Date.now() + EXPIRATION_TIME_MS;
  sessionStore.set(psid, { commentId, expiresAt });
  console.log(`[SessionStore] Saved session for PSID: ${psid}`);
}

export function getAndClearSession(psid: string): string | null {
  const record = sessionStore.get(psid);

  if (!record) {
    console.log(`[SessionStore] No session found for PSID: ${psid}`);
    return null;
  }

  // Immediately delete the record to ensure it's used only once.
  sessionStore.delete(psid);

  if (Date.now() > record.expiresAt) {
    console.log(`[SessionStore] Expired session found and deleted for PSID: ${psid}`);
    return null;
  }

  console.log(`[SessionStore] Found and cleared session for PSID: ${psid}`);
  return record.commentId;
} 