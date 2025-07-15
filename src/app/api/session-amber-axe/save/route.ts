import { NextResponse } from 'next/server';
import { saveSession, getSession } from '../../../../lib/session-store';

// TA LINIA JEST KLUCZOWA - ZMUSZA VERCEL DO UŻYWANIA ŚRODOWISKA NODE.JS
export const runtime = 'nodejs';

export async function POST(request: Request) {
  console.log('[SESSION_SAVE_AMBER_AXE] Received request to save session data.');
  try {
    const body = await request.json();
    console.log('[SESSION_SAVE_AMBER_AXE] Raw request body:', JSON.stringify(body, null, 2));
    const { psid, ...newData } = body;

    if (!psid) {
      console.error('[SESSION_SAVE_AMBER_AXE] Validation failed: Missing psid.');
      return NextResponse.json({ error: 'Missing psid' }, { status: 400 });
    }

    if (Object.keys(newData).length === 0) {
        console.warn(`[SESSION_SAVE_AMBER_AXE] No new data provided to save for psid: ${psid}. This will clear the session.`);
        // Umożliwiamy czyszczenie sesji przez wysłanie pustego obiektu
    }

    // 1. Pobierz istniejącą sesję
    const existingSession = await getSession(psid) || {};
    console.log(`[SESSION_SAVE_AMBER_AXE] Existing session for psid ${psid}:`, JSON.stringify(existingSession, null, 2));

    // 2. Połącz istniejące dane z nowymi lub wyczyść sesję
    const updatedSession = Object.keys(newData).length > 0 
      ? { ...existingSession, ...newData } 
      : {}; // To zapewni wyczyszczenie sesji
    console.log(`[SESSION_SAVE_AMBER_AXE] Updated session for psid ${psid}:`, JSON.stringify(updatedSession, null, 2));

    // 3. Zapisz zaktualizowaną sesję w Redis
    await saveSession(psid, updatedSession);
    console.log(`[SESSION_SAVE_AMBER_AXE] Session saved successfully for psid: ${psid}.`);

    // Zwróć sukces z zapisanymi danymi
    return NextResponse.json({ success: true, message: `Session updated for psid: ${psid}`, data: updatedSession });

  } catch (error) {
    console.error('[SESSION_SAVE_AMBER_AXE] A critical error occurred:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
  }
} 