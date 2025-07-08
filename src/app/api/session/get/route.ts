import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/session-store';

// TA LINIA JEST KLUCZOWA - ZMUSZA VERCEL DO UŻYWANIA ŚRODOWISKA NODE.JS
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { psid } = body;

    if (!psid) {
      return NextResponse.json({ error: 'Missing psid' }, { status: 400 });
    }

    // Odczytaj obiekt sesji z bazy Redis (np. { "commentId": "123_456" })
    const sessionData = await getSession(psid);

    if (!sessionData) {
      // To jest oczekiwane zachowanie, gdy sesja nie istnieje lub wygasła
      return NextResponse.json({ error: 'Session not found or expired' }, { status: 404 });
    }

    // Zwróć znaleziony obiekt sesji bezpośrednio.
    // Odpowiedź będzie miała postać: { "commentId": "123_456" }
    return NextResponse.json(sessionData);

  } catch (error) {
    console.error('[API Get Error]', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
  }
}