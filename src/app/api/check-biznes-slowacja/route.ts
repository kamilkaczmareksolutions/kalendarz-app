import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import dayjs from 'dayjs';
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

		// --- CORRECT LOGIC: Search for the event using a query in the description ---
		console.log(`[CHECK] Searching for event with custom ID in description: ${id}`);
		const now = dayjs();
		// Search a wide range to ensure the event is found
		const timeMin = now.subtract(60, 'day').toISOString();
		const timeMax = now.add(60, 'day').toISOString();

		const eventsResponse = await calendar.events.list({
			calendarId: 'primary',
			q: `Identyfikator wydarzenia: ${id}`, // Use q to search the description
			singleEvents: true,
			timeMin,
			timeMax,
		});

		const events = eventsResponse.data.items;

		// If no events are found, it doesn't exist
		if (!events || events.length === 0) {
			console.log(`[CHECK] Event with custom ID ${id} not found in Google Calendar.`);
			return NextResponse.json({ exists: false });
		}

		// Warn if multiple events are found, but proceed with the first one
		if (events.length > 1) {
			console.warn(`[CHECK] Found multiple events with the same custom ID: ${id}. Using the first one.`);
		}
		
		const matchingEvent = events[0];
		console.log(`[CHECK] Found matching event with Google Event ID: ${matchingEvent.id}`);

		// Return the found event data
		return NextResponse.json({
			exists: true,
			event: matchingEvent,
		});

	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'An unknown error occurred';
		console.error('[CHECK] A critical error occurred:', error);
		return NextResponse.json({ error: 'Failed to check event', details: message }, { status: 500 });
	}
}