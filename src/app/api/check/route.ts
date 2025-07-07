import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/google';

export async function POST(request: NextRequest) {
	console.log('[CHECK] Received request to check event.');
	try {
		const { id } = await request.json();

		console.log(`[CHECK] Request body validated. Event ID: ${id}`);

		if (!id) {
			console.log('[CHECK] Validation failed: Missing id.');
			return NextResponse.json({ error: 'Missing id' }, { status: 400 });
		}

		const auth = getGoogleAuth();
		const calendar = google.calendar({ version: 'v3', auth });

		try {
			const eventId = Buffer.from(id, 'base64').toString('ascii');
			console.log(`[CHECK] Decoded Event ID: ${eventId}`);
			
			console.log(`[CHECK] Fetching event with ID: ${eventId}`);
			const eventResponse = await calendar.events.get({
				calendarId: 'primary',
				eventId: eventId,
			});
			
			console.log('[CHECK] Event found.');
			return NextResponse.json({
				exists: true,
				event: eventResponse.data,
			});

		} catch (error: unknown) {
			if (error && typeof error === 'object' && 'code' in error && (error as {code: number}).code === 404) {
				console.log('[CHECK] Event not found in calendar.');
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