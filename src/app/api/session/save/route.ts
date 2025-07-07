import { NextResponse } from 'next/server';
import { saveSession } from '../../../../lib/session-store';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { psid, commentId } = body;

    if (!psid || !commentId) {
      return NextResponse.json({ error: 'Missing psid or commentId' }, { status: 400 });
    }

    saveSession(psid, commentId);

    return NextResponse.json({ success: true, message: `Session saved for psid: ${psid}` });
  } catch (error) {
    console.error('[API /session/save] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to save session', details: errorMessage }, { status: 500 });
  }
} 