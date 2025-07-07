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
	const token = req.headers.get('x-webhook-token');
	if (token !== process.env.WEBHOOK_SECRET) {
		return NextResponse.json(
			{ message: 'Forbidden – invalid token' },
			{ status: 403 }
		);
	}

	const body = await req.json();
	const { id, newDate } = body;

	if (!id || !newDate) {
		return NextResponse.json(
			{ message: 'Missing fields: id, newDate' },
			{ status: 400 }
		);
	}

	const calendarId = process.env.GOOGLE_CALENDAR_ID!;
	const clientEmail = process.env.GOOGLE_CLIENT_EMAIL!;
	const privateKey = process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, '\n');

	const auth = new google.auth.JWT({
		email: clientEmail,
		key: privateKey,
		scopes: SCOPES,
		subject: 'kamil.kaczmarek@lejki.pro',
	});

	const calendar = google.calendar({ version: 'v3', auth });

	try {
		// Find event by ID in description, only searching for future events
		const listResponse = await calendar.events.list({
			calendarId,
			q: `Identyfikator wydarzenia: ${id}`,
			timeMin: dayjs().toISOString(), // Search from now onwards
			maxResults: 1,
			singleEvents: true,
			orderBy: 'startTime'
		});

		if (!listResponse.data.items || listResponse.data.items.length === 0) {
			return NextResponse.json({ updated: false, message: 'Event not found' }, { status: 404 });
		}

		const originalEvent = listResponse.data.items[0];
		const eventId = originalEvent.id!;
		const start = dayjs.tz(newDate, 'Europe/Warsaw');
		const end = start.add(30, 'minutes');

		const updatedEvent = await calendar.events.update({
			calendarId,
			eventId,
			requestBody: {
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
			},
		});

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
