import { RedisClientType, createClient } from 'redis';

// Definiujemy stałą dla czasu życia sesji (TTL) - 2 tygodnie w sekundach.
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; 

let redisClient: RedisClientType | null = null;

// Definiujemy dedykowany typ dla danych sesji, aby unikać 'any' i spełnić wymagania lintera.
export type SessionData = Record<string, unknown>;

async function getRedisClient() {
  if (!process.env.REDIS_URL) {
    throw new Error('Missing environment variable REDIS_URL');
  }
  
  if (!redisClient) {
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    await redisClient.connect();
  }
  return redisClient;
}

/**
 * Zapisuje obiekt danych sesji w Redis.
 * @param psid Identyfikator użytkownika (klucz).
 * @param sessionData Obiekt z danymi sesji do zapisania.
 */
export async function saveSession(psid: string, sessionData: SessionData): Promise<void> {
  try {
    const client = await getRedisClient();
    const key = `session:${psid}`;
    const value = JSON.stringify(sessionData);
    // Używamy stałej SESSION_TTL_SECONDS do ustawienia czasu wygaśnięcia.
    await client.set(key, value, { EX: SESSION_TTL_SECONDS });
    console.log(`[Redis Store] Session saved for key: ${key} with TTL of 2 weeks. Data:`, sessionData);
  } catch (error) {
    console.error('[Redis Save Error]', error);
  }
}

/**
 * Pobiera obiekt danych sesji z Redis.
 * @param psid Identyfikator użytkownika (klucz).
 * @returns Obiekt danych sesji lub null, jeśli nie istnieje.
 */
export async function getSession(psid: string): Promise<SessionData | null> {
  try {
    const client = await getRedisClient();
    const key = `session:${psid}`;
    const value = await client.get(key);

    if (!value) {
      return null;
    }
    
    return JSON.parse(value) as SessionData;
  } catch (err) {
    console.error('[Redis Store] Error getting session:', err);
    return null;
  }
}