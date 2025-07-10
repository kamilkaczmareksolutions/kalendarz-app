import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/session-store';

// TA LINIA JEST KLUCZOWA - ZMUSZA VERCEL DO UŻYWANIA ŚRODOWISKA NODE.JS
export const runtime = 'nodejs';

export async function POST(request: Request) {
  console.log('[SESSION_GET] Received request to get session data.');
  try {
    const body = await request.json();
    const { psid } = body;
    console.log(`[SESSION_GET] Request for psid: ${psid}`);

    if (!psid) {
      console.error('[SESSION_GET] Validation failed: Missing psid.');
      return NextResponse.json({ error: 'Missing psid' }, { status: 400 });
    }

    // Odczytaj obiekt sesji z bazy Redis (np. { "commentId": "123_456" })
    const sessionData = await getSession(psid);

    if (!sessionData) {
      // To jest oczekiwane zachowanie, gdy sesja nie istnieje lub wygasła
      console.log(`[SESSION_GET] Session not found for psid: ${psid}`);
      return NextResponse.json({ error: 'Session not found or expired' }, { status: 404 });
    }

    // Zwróć znaleziony obiekt sesji bezpośrednio.
    // Odpowiedź będzie miała postać: { "commentId": "123_456" }
    console.log(`[SESSION_GET] Found session data for psid: ${psid}. Data:`, JSON.stringify(sessionData, null, 2));
    return NextResponse.json(sessionData);

  } catch (error) {
    console.error('[SESSION_GET] A critical error occurred:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
  }
}