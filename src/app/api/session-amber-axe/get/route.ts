import { NextResponse } from 'next/server';
import { getSession, saveSession } from '../../../../lib/session-store';

// TA LINIA JEST KLUCZOWA - ZMUSZA VERCEL DO UŻYWANIA ŚRODOWISKA NODE.JS
export const runtime = 'nodejs';

export async function POST(request: Request) {
  console.log('[SESSION_GET_AMBER_AXE_V2] Received request to get session data.');
  try {
    const body = await request.json();
    const { psid } = body;
    console.log(`[SESSION_GET_AMBER_AXE_V2] Request for psid: ${psid}`);

    if (!psid) {
      console.error('[SESSION_GET_AMBER_AXE_V2] Validation failed: Missing psid.');
      return NextResponse.json({ error: 'Missing psid' }, { status: 400 });
    }

    let sessionData = await getSession(psid);

    if (!sessionData) {
      console.log(`[SESSION_GET_AMBER_AXE_V2] Session not found for psid: ${psid}. Creating a new one.`);
      
      // Jeśli sesja nie istnieje, tworzymy nową.
      const newCommentId = `${psid}_${Date.now()}`;
      const newSession = {
        commentId: newCommentId,
        human_takeover: false,
      };

      // Zapisujemy nową sesję w bazie danych.
      await saveSession(psid, newSession);
      console.log(`[SESSION_GET_AMBER_AXE_V2] New session created and saved for psid: ${psid}.`);
      
      // Ustawiamy dane sesji na nowo utworzoną sesję.
      sessionData = newSession;
    }

    // Zapewnienie spójności klucza 'locked' przed zwróceniem danych do n8n
    if (sessionData && typeof sessionData.lock === 'boolean') {
      if (typeof sessionData.locked !== 'boolean') {
        sessionData.locked = sessionData.lock;
      }
      delete sessionData.lock;
    }

    // Zwracamy znalezione lub nowo utworzone dane sesji.
    console.log(`[SESSION_GET_AMBER_AXE_V2] Returning session data for psid: ${psid}. Data:`, JSON.stringify(sessionData, null, 2));
    return NextResponse.json(sessionData);

  } catch (error) {
    console.error('[SESSION_GET_AMBER_AXE_V2] A critical error occurred:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
  }
} 