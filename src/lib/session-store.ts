// src/lib/session-store.ts

import { kv } from '@vercel/kv';

const SESSION_TTL_SECONDS = 300; // Sesja będzie ważna przez 5 minut

/**
 * Zapisuje powiązanie PSID -> commentId w trwałej bazie danych Vercel KV.
 * @param psid - Page-Scoped ID użytkownika z Messengera.
 * @param commentId - Unikalne ID komentarza z Facebooka.
 */
export async function saveSession(psid: string, commentId: string): Promise<void> {
  // Klucz sesji to PSID użytkownika
  const key = `session:${psid}`;
  // Zapisujemy ID komentarza z czasem wygaśnięcia (Time-To-Live)
  await kv.set(key, commentId, { ex: SESSION_TTL_SECONDS });
  console.log(`[KV Store] Session saved for key: ${key}`);
}

/**
 * Odczytuje ID komentarza powiązane z danym PSID i natychmiast je usuwa,
 * aby zapobiec ponownemu użyciu.
 * @param psid - Page-Scoped ID użytkownika z Messengera.
 * @returns - Zapisane ID komentarza lub null, jeśli sesja nie istnieje lub wygasła.
 */
export async function getAndClearSession(psid: string): Promise<string | null> {
  const key = `session:${psid}`;
  
  // Pobieramy ID komentarza
  const commentId = await kv.get<string>(key);
  console.log(`[KV Store] Attempting to get session for key: ${key}. Found: ${commentId}`);

  if (commentId) {
    // Jeśli sesja została znaleziona, usuwamy ją, aby uniknąć ponownego użycia.
    await kv.del(key);
    console.log(`[KV Store] Session cleared for key: ${key}.`);
  }

  return commentId;
} 