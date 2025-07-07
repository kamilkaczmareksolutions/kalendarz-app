import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { getGoogleAuth } from '@/lib/google';

dayjs.extend(utc);
dayjs.extend(timezone);

const SCOPES = [
	'https://www.googleapis.com/auth/calendar',
	'https://www.googleapis.com/auth/calendar.events',
];

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
		console.log(`[UPDATE] Request body validated. Event ID: ${id}, New Date: ${newDate}`);

		if (!id || !newDate) {
			console.log('[UPDATE] Validation failed: Missing id or newDate.');
			return NextResponse.json({ error: 'Missing id or newDate' }, { status: 400 });
		}

		const auth = getGoogleAuth();
		const calendar = google.calendar({ version: 'v3', auth });

		const eventId = Buffer.from(id, 'base64').toString('ascii');
		console.log(`[UPDATE] Decoded Event ID: ${eventId}`);

		// Fetch the existing event to get details like attendees
		let event;
		try {
			console.log(`[UPDATE] Fetching event with ID: ${eventId}`);
			const eventResponse = await calendar.events.get({
				calendarId: 'primary',
				eventId: eventId,
			});
			event = eventResponse.data;
			console.log('[UPDATE] Successfully fetched event details.');
		} catch (error: any) {
			console.error('[UPDATE] Error fetching event:', error.message);
			// If event not found, it might have been deleted or is invalid
			return NextResponse.json({ error: 'Event not found or invalid ID.' }, { status: 404 });
		}

		if (!event.attendees) {
			console.log('[UPDATE] Event has no attendees. Cannot update.');
			return NextResponse.json({ error: 'Event has no attendees.' }, { status: 400 });
		}
		
		const organizer = event.organizer;
		if (!organizer || !organizer.email) {
			console.error('[UPDATE] Organizer email is missing from the event.');
			return NextResponse.json({ error: 'Organizer email is missing.' }, { status: 500 });
		}

		console.log(`[UPDATE] Original organizer: ${organizer.email}`);
		
		// The main user (the one whose calendar we're operating on) might be different
		// from the service account. Let's find the main attendee to impersonate.
		const mainUserAttendee = event.attendees.find(
			(attendee) => attendee.email === organizer.email
		);

		if (!mainUserAttendee) {
			console.error('[UPDATE] Could not find organizer in the attendee list.');
			return NextResponse.json({ error: 'Could not find organizer in the attendee list.' }, { status: 500 });
		}

		console.log(`[UPDATE] Found main user to impersonate: ${mainUserAttendee.email}`);

		// Create a new auth client to impersonate the user
		const userAuth = getGoogleAuth(mainUserAttendee.email);
		const userCalendar = google.calendar({ version: 'v3', auth: userAuth });

		const updatedEvent = {
			summary: event.summary,
			description: event.description,
			attendees: event.attendees,
			start: {
				dateTime: dayjs.tz(newDate, 'Europe/Warsaw').format(),
				timeZone: 'Europe/Warsaw',
			},
			end: {
				dateTime: dayjs.tz(newDate, 'Europe/Warsaw').add(30, 'minutes').format(),
				timeZone: 'Europe/Warsaw',
			},
		};

		console.log('[UPDATE] Preparing to update event with new times:', updatedEvent);

		const response = await userCalendar.events.update({
			calendarId: 'primary',
			eventId: eventId,
			requestBody: updatedEvent,
			sendNotifications: true,
		});

		console.log('[UPDATE] Event updated successfully. Response from Google:', response.data);

		return NextResponse.json({
			updated: true,
			eventId: response.data.id,
			eventLink: response.data.htmlLink,
			version: '1.0.2',
		});
	} catch (error: any) {
		console.error('[UPDATE] A critical error occurred:', error);
		return NextResponse.json({ error: 'Failed to update event', details: error.message }, { status: 500 });
	}
}
