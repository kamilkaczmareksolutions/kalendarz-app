import { NextResponse } from 'next/server';
import { getAndClearSession } from '../../../../lib/session-store';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { psid } = body;

    if (!psid) {
      return NextResponse.json({ error: 'Missing psid' }, { status: 400 });
    }

    const commentId = getAndClearSession(psid);

    if (!commentId) {
      return NextResponse.json({ error: 'Session not found or expired' }, { status: 404 });
    }

    return NextResponse.json({ success: true, commentId: commentId });
  } catch (error) {
    console.error('[API /session/get] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to get session', details: errorMessage }, { status: 500 });
  }
} 