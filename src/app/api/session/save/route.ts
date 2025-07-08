import { NextResponse } from 'next/server';
import { saveSession, getSession } from '../../../../lib/session-store';

// TA LINIA JEST KLUCZOWA - ZMUSZA VERCEL DO UŻYWANIA ŚRODOWISKA NODE.JS
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { psid, ...newData } = body;

    if (!psid) {
      return NextResponse.json({ error: 'Missing psid' }, { status: 400 });
    }

    if (Object.keys(newData).length === 0) {
        return NextResponse.json({ error: 'No data provided to save' }, { status: 400 });
    }

    // 1. Pobierz istniejącą sesję
    const existingSession = await getSession(psid) || {};

    // 2. Połącz istniejące dane z nowymi
    const updatedSession = { ...existingSession, ...newData };

    // 3. Zapisz zaktualizowaną sesję w Redis
    await saveSession(psid, updatedSession);

    // Zwróć sukces z zapisanymi danymi
    return NextResponse.json({ success: true, message: `Session updated for psid: ${psid}`, data: updatedSession });

  } catch (error) {
    console.error('[API Save Error]', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
  }
}