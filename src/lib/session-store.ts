import { RedisClientType, createClient } from 'redis';

// Definiujemy stałą dla czasu życia sesji (TTL) - 2 tygodnie w sekundach.
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; 

let redisClient: RedisClientType | null = null;

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

export async function saveSession(psid: string, commentId: string): Promise<void> {
  try {
    const client = await getRedisClient();
    const key = `session:${psid}`;
    const value = JSON.stringify({ commentId });
    // Używamy stałej SESSION_TTL_SECONDS do ustawienia czasu wygaśnięcia.
    await client.set(key, value, { ex: SESSION_TTL_SECONDS });
    console.log(`[Redis Store] Session saved for key: ${key} with TTL of 2 weeks.`);
  } catch (error) {
    console.error('[Redis Save Error]', error);
  }
}

export async function getSession(psid: string): Promise<{ commentId: string } | null> {
  try {
    const client = await getRedisClient();
    const key = `session:${psid}`;
    const sessionData = await client.get(key);
    
    if (sessionData) {
      console.log(`[Redis Store] Session retrieved for key: ${key}`);
      return JSON.parse(sessionData);
    } else {
      console.log(`[Redis Store] Session not found for key: ${key}`);
      return null;
    }
  } catch (error) {
    console.error('[Redis Get Error]', error);
    return null;
  }
}