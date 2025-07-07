import Redis from 'ioredis';

// --- Configuration ---
const SESSION_TTL_SECONDS = 300; // Sesja będzie ważna przez 5 minut

// Sprawdzamy, czy zmienna środowiskowa REDIS_URL istnieje.
// Jeśli nie, rzucamy błąd, ponieważ aplikacja nie może działać bez połączenia.
if (!process.env.REDIS_URL) {
  throw new Error('Missing environment variable REDIS_URL');
}

// Tworzymy klienta Redis używając adresu URL z zmiennych środowiskowych.
const redis = new Redis(process.env.REDIS_URL);

/**
 * Zapisuje powiązanie PSID -> commentId w bazie danych Redis.
 * @param psid - Page-Scoped ID użytkownika z Messengera.
 * @param commentId - Unikalne ID komentarza z Facebooka.
 */
export async function saveSession(psid: string, commentId: string): Promise<void> {
  const key = `session:${psid}`;
  // Używamy komendy SET z opcją EX (expire) do ustawienia klucza z czasem wygaśnięcia.
  await redis.set(key, commentId, 'EX', SESSION_TTL_SECONDS);
  console.log(`[Redis Store] Session saved for key: ${key}`);
}

/**
 * Odczytuje ID komentarza powiązane z danym PSID i natychmiast je usuwa,
 * aby zapobiec ponownemu użyciu (transakcja atomowa).
 * @param psid - Page-Scoped ID użytkownika.
 * @returns Zapisane ID komentarza lub null, jeśli nie znaleziono.
 */
export async function getAndClearSession(psid: string): Promise<string | null> {
  const key = `session:${psid}`;
  // Używamy transakcji (pipeline), aby zapewnić, że operacje GET i DEL
  // zostaną wykonane atomowo jedna po drugiej.
  const pipeline = redis.pipeline();
  pipeline.get(key); // 1. Pobierz wartość
  pipeline.del(key); // 2. Usuń klucz

  // Wykonujemy transakcję i pobieramy wyniki
  const results = await pipeline.exec();

  // Wyniki to tablica, gdzie każdy element odpowiada wynikowi jednej komendy
  // results[0] to wynik komendy 'get'
  const commentId = results && results[0] && results[0][1] as string | null;

  if (commentId) {
    console.log(`[Redis Store] Session retrieved and cleared for key: ${key}`);
  } else {
    console.log(`[Redis Store] Session not found for key: ${key}`);
  }

  return commentId;
}