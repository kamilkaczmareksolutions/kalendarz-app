import { NextResponse } from 'next/server';
import { saveSession, getSession } from '../../../../lib/session-store';

// TA LINIA JEST KLUCZOWA - ZMUSZA VERCEL DO UŻYWANIA ŚRODOWISKA NODE.JS
export const runtime = 'nodejs';

export async function POST(request: Request) {
  console.log('[SESSION_SAVE] Received request to save session data.');
  try {
    const body = await request.json();
    console.log('[SESSION_SAVE] Raw request body:', JSON.stringify(body, null, 2));
    const { psid, ...newData } = body;

    if (!psid) {
      console.error('[SESSION_SAVE] Validation failed: Missing psid.');
      return NextResponse.json({ error: 'Missing psid' }, { status: 400 });
    }

    if (Object.keys(newData).length === 0) {
        console.warn(`[SESSION_SAVE] No new data provided to save for psid: ${psid}.`);
        return NextResponse.json({ error: 'No data provided to save' }, { status: 400 });
    }

    // 1. Pobierz istniejącą sesję
    const existingSession = await getSession(psid) || {};
    console.log(`[SESSION_SAVE] Existing session for psid ${psid}:`, JSON.stringify(existingSession, null, 2));

    // 2. Połącz istniejące dane z nowymi
    const updatedSession = { ...existingSession, ...newData };
    console.log(`[SESSION_SAVE] Updated session for psid ${psid}:`, JSON.stringify(updatedSession, null, 2));

    // 3. Zapisz zaktualizowaną sesję w Redis
    await saveSession(psid, updatedSession);
    console.log(`[SESSION_SAVE] Session saved successfully for psid: ${psid}.`);

    // Zwróć sukces z zapisanymi danymi
    return NextResponse.json({ success: true, message: `Session updated for psid: ${psid}`, data: updatedSession });

  } catch (error) {
    console.error('[SESSION_SAVE] A critical error occurred:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
  }
}