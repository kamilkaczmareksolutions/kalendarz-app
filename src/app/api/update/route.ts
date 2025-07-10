import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { getGoogleAuth } from '@/lib/google';

dayjs.extend(utc);
dayjs.extend(timezone);

// This comment is added to force a redeployment on Vercel
// to resolve a potential caching or build issue causing a 404 error.
export const runtime = 'nodejs'; // Force Node.js runtime for compatibility with Google APIs

export async function POST(req: NextRequest) {
	console.log('[UPDATE] Received request to update event.');
	try {
	const token = req.headers.get('x-webhook-token');
	if (token !== process.env.WEBHOOK_SECRET) {
		return NextResponse.json(
			{ message: 'Forbidden – invalid token' },
			{ status: 403 }
		);
	}

		console.log('[UPDATE] Token validated.');
	const body = await req.json();
		console.log('[UPDATE] Raw request body:', JSON.stringify(body, null, 2));
	const { id, newDate } = body;
		console.log(`[UPDATE] Destructured data: id=${id}, newDate=${newDate}`);

	if (!id || !newDate) {
			console.error('[UPDATE] Validation failed: Missing id or newDate.');
			return NextResponse.json({ error: 'Missing id or newDate' }, { status: 400 });
	}

		const auth = getGoogleAuth();
	const calendar = google.calendar({ version: 'v3', auth });

		// 1. Znajdź wydarzenie na podstawie unikalnego ID w opisie
		let matchingEvent;
	try {
			console.log(`[UPDATE] Searching for event with custom ID in description: ${id}`);
			const now = dayjs();
			// Przeszukujemy szerszy zakres, aby na pewno znaleźć wydarzenie
			const timeMin = now.subtract(60, 'day').toISOString();
			const timeMax = now.add(60, 'day').toISOString();

			const eventsResponse = await calendar.events.list({
				calendarId: 'primary',
				q: `Identyfikator wydarzenia: ${id}`, // Używamy q do przeszukiwania
				singleEvents: true,
				timeMin,
				timeMax,
		});

			const events = eventsResponse.data.items;
			if (!events || events.length === 0) {
				console.error(`[UPDATE] Event with custom ID ${id} not found.`);
				return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
		}

			if (events.length > 1) {
				console.warn(`[UPDATE] Found multiple events with the same custom ID: ${id}. Using the first one.`);
			}
			matchingEvent = events[0];
			console.log(`[UPDATE] Found matching event with Google Event ID: ${matchingEvent.id}`);

		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'An unknown error occurred';
			console.error('[UPDATE] Error searching for event:', message);
			return NextResponse.json({ error: 'Failed to search for event', details: message }, { status: 500 });
		}
		
		if (!matchingEvent) {
			console.error(`[UPDATE] Logic error: matchingEvent is null or undefined after search.`);
			return NextResponse.json({ error: 'Event not found after search.' }, { status: 404 });
		}

		// Zabezpieczenie przed brakiem ID
		if (!matchingEvent.id) {
			console.error(`[UPDATE] Found event does not have a Google Event ID.`);
			return NextResponse.json({ error: 'Found event is invalid.' }, { status: 500 });
		}

		// 2. Przygotuj zaktualizowane dane wydarzenia
		const updatedEventData = {
			summary: matchingEvent.summary,
			description: matchingEvent.description,
			attendees: matchingEvent.attendees,
				start: {
				dateTime: dayjs(newDate).toISOString(),
					timeZone: 'Europe/Warsaw',
				},
				end: {
				dateTime: dayjs(newDate).add(30, 'minutes').toISOString(),
					timeZone: 'Europe/Warsaw',
				},
		};

		// 3. Zaktualizuj wydarzenie używając jego PRAWDZIWEGO ID z Google
		console.log(`[UPDATE] Updating event with Google Event ID: ${matchingEvent.id}...`);
		const updateResponse = await calendar.events.update({
			calendarId: 'primary',
			eventId: matchingEvent.id, // Używamy prawdziwego ID
			requestBody: updatedEventData,
			sendNotifications: true,
		});
		console.log('[UPDATE] Event updated successfully in Google Calendar.');

		return NextResponse.json(updateResponse.data);

	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'An unknown error occurred';
		console.error('[UPDATE] A critical error occurred:', error);
		return NextResponse.json({ error: 'Failed to update event', details: message }, { status: 500 });
	}
}