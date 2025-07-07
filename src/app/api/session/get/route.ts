import { NextResponse } from 'next/server';
import { getAndClearSession } from '../../../../lib/session-store';

// TA LINIA JEST KLUCZOWA - ZMUSZA VERCEL DO UŻYWANIA ŚRODOWISKA NODE.JS
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { psid } = body;

    if (!psid) {
      return NextResponse.json({ error: 'Missing psid' }, { status: 400 });
    }

    // Odczytaj i usuń sesję z bazy Redis
    const commentId = await getAndClearSession(psid);

    if (!commentId) {
      // To jest oczekiwane zachowanie, gdy sesja nie istnieje lub wygasła
      return NextResponse.json({ error: 'Session not found or expired' }, { status: 404 });
    }

    // Zwróć znalezione ID komentarza
    return NextResponse.json({ commentId });

  } catch (error) {
    console.error('[API Get Error]', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
  }
}