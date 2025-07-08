import { createClient } from 'redis';

const SESSION_TTL_SECONDS = 300; // 5 minut

// Zmienna do przechowywania połączenia z Redis, aby unikać ponownego łączenia przy każdym wywołaniu
let redisClient: ReturnType<typeof createClient> | null = null;

/**
 * Funkcja do tworzenia i zarządzania pojedynczym połączeniem z Redis.
 */
async function getRedisClient() {
  if (!process.env.REDIS_URL) {
    throw new Error('Missing environment variable REDIS_URL');
  }
  
  if (!redisClient) {
    redisClient = createClient({ url: process.env.REDIS_URL });
    // Obsługa błędów, aby aplikacja nie uległa awarii
    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    await redisClient.connect();
  }
  return redisClient;
}

/**
 * Zapisuje powiązanie PSID -> commentId w bazie danych Redis.
 */
export async function saveSession(psid: string, commentId: string): Promise<void> {
  try {
    const client = await getRedisClient();
    const key = `session:${psid}`;
    await client.set(key, commentId, { EX: SESSION_TTL_SECONDS });
    console.log(`[Redis Store] Session saved for key: ${key}`);
  } catch (error) {
    console.error('[Redis Save Error]', error);
  }
}

/**
 * Odczytuje ID komentarza powiązane z danym PSID i natychmiast je usuwa.
 */
export async function getAndClearSession(psid: string): Promise<string | null> {
  try {
    const client = await getRedisClient();
    const key = `session:${psid}`;
    
    // Pobierz i usuń w jednej operacji (atomowej)
    const commentId = await client.getDel(key);
    
    if (commentId) {
      console.log(`[Redis Store] Session retrieved and cleared for key: ${key}`);
    } else {
      console.log(`[Redis Store] Session not found for key: ${key}`);
    }
    
    return commentId;
  } catch (error) {
    console.error('[Redis Get/Clear Error]', error);
    return null;
  }
}

/**
 * Odczytuje ID komentarza dla danego PSID bez usuwania go z sesji.
 */
export async function getSession(psid: string): Promise<string | null> {
  try {
    const client = await getRedisClient();
    const key = `session:${psid}`;
    
    // Tylko pobierz, bez usuwania
    const commentId = await client.get(key);
    
    if (commentId) {
      console.log(`[Redis Store] Session retrieved for key: ${key}`);
    } else {
      console.log(`[Redis Store] Session not found for key: ${key}`);
    }
    
    return commentId;
  } catch (error) {
    console.error('[Redis Get Error]', error);
    return null;
  }
}