import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const SCOPES = [
	'https://www.googleapis.com/auth/calendar',
	'https://www.googleapis.com/auth/calendar.events',
];

export async function POST(req: NextRequest) {
	console.log('[UPDATE] Received request. Processing...');
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
		return NextResponse.json(
			{ message: 'Missing fields: id, newDate' },
			{ status: 400 }
		);
	}

	const calendarId = process.env.GOOGLE_CALENDAR_ID!;
	const clientEmail = process.env.GOOGLE_CLIENT_EMAIL!;
	const privateKey = process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, '\n');
	const impersonationEmail = process.env.GOOGLE_IMPERSONATION_EMAIL!;

	const auth = new google.auth.GoogleAuth({
		credentials: {
			client_email: clientEmail,
			private_key: privateKey,
		},
		scopes: SCOPES,
		clientOptions: {
			subject: impersonationEmail,
		},
	});

	const calendar = google.calendar({ version: 'v3', auth });

	try {
		// Find event by ID in description, only searching for future events
		const searchQuery = `Identyfikator wydarzenia: ${id}`;
		console.log(`[UPDATE] Searching for event to update with query: "${searchQuery}"`);
		const listResponse = await calendar.events.list({
			calendarId,
			q: searchQuery,
			timeMin: dayjs().toISOString(), // Search from now onwards
			maxResults: 1,
			singleEvents: true,
			orderBy: 'startTime'
		});

		console.log('[UPDATE] Raw find response from Google:', JSON.stringify(listResponse.data, null, 2));

		if (!listResponse.data.items || listResponse.data.items.length === 0) {
			console.log('[UPDATE] Event not found.');
			return NextResponse.json({ updated: false, message: 'Event not found' }, { status: 404 });
		}

		console.log('[UPDATE] Event found. Proceeding with update.');
		const originalEvent = listResponse.data.items[0];
		const eventId = originalEvent.id!;
		const start = dayjs.tz(newDate, 'Europe/Warsaw');
		const end = start.add(30, 'minutes');

		const eventToUpdate = {
			summary: originalEvent.summary,
			description: originalEvent.description,
			attendees: originalEvent.attendees,
			start: {
				dateTime: start.format(),
				timeZone: 'Europe/Warsaw',
			},
			end: {
				dateTime: end.format(),
				timeZone: 'Europe/Warsaw',
			},
		};
		
		console.log('[UPDATE] Updating event with new data:', JSON.stringify(eventToUpdate, null, 2));

		const updatedEvent = await calendar.events.update({
			calendarId,
			eventId,
			requestBody: eventToUpdate,
		});

		console.log('[UPDATE] Event updated successfully.');
		return NextResponse.json({
			updated: true,
			eventId: updatedEvent.data.id,
			eventLink: updatedEvent.data.htmlLink,
			version: '1.0.1',
		});
	} catch (error) {
		console.error('Error updating event:', error);
		return NextResponse.json({ message: 'Error updating event' }, { status: 500 });
	}
}
