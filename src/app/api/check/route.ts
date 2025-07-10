import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/google';

export const runtime = 'nodejs'; // Force Node.js runtime for compatibility with Google APIs

export async function POST(request: NextRequest) {
	console.log('[CHECK] Received request to check event.');
	try {
		const body = await request.json();
		console.log('[CHECK] Raw request body:', JSON.stringify(body, null, 2));
		const { id } = body;
		console.log(`[CHECK] Destructured data: id=${id}`);

		if (!id) {
			console.error('[CHECK] Validation failed: Missing id.');
			return NextResponse.json({ error: 'Missing id' }, { status: 400 });
		}

		const auth = getGoogleAuth();
		const calendar = google.calendar({ version: 'v3', auth });

		try {
			const eventId = id; // Używamy ID bezpośrednio
			
			console.log(`[CHECK] Fetching event with ID: ${eventId} from primary calendar.`);
			const eventResponse = await calendar.events.get({
				calendarId: 'primary',
				eventId: eventId,
			});
			
			console.log('[CHECK] Event found successfully.');
			return NextResponse.json({
				exists: true,
				event: eventResponse.data,
			});

		} catch (error: unknown) {
			if (error && typeof error === 'object' && 'code' in error && (error as {code: number}).code === 404) {
				console.log('[CHECK] Event not found in calendar (404).');
				return NextResponse.json({ exists: false });
			}
			// Re-throw other errors
			throw error;
		}
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'An unknown error occurred';
		console.error('[CHECK] A critical error occurred:', error);
		return NextResponse.json({ error: 'Failed to check event', details: message }, { status: 500 });
	}
}