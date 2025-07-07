import { NextResponse } from 'next/server';
import { saveSession } from '../../../../lib/session-store';

// TA LINIA JEST KLUCZOWA - ZMUSZA VERCEL DO UŻYWANIA ŚRODOWISKA NODE.JS
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { psid, commentId } = body;

    if (!psid || !commentId) {
      return NextResponse.json({ error: 'Missing psid or commentId' }, { status: 400 });
    }

    // Zapisz sesję w bazie danych Redis
    await saveSession(psid, commentId);

    // Zwróć sukces, aby n8n wiedział, że wszystko jest w porządku
    return NextResponse.json({ success: true, message: `Session saved for psid: ${psid}` });

  } catch (error) {
    console.error('[API Save Error]', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Internal Server Error', details: errorMessage }, { status: 500 });
  }
}