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
		
		// 1. Prepare the updated event data
		const updatedEventData = {
			summary: event.summary,
			description: event.description,
			attendees: event.attendees,
			start: {
				dateTime: dayjs(newDate).tz('Europe/Warsaw').toISOString(),
				timeZone: 'Europe/Warsaw',
			},
			end: {
				dateTime: dayjs(newDate).add(30, 'minutes').tz('Europe/Warsaw').toISOString(),
				timeZone: 'Europe/Warsaw',
			},
		};

		// 2. Update the event in the organizer's calendar first
		console.log('[UPDATE] Updating event in organizer calendar...');
		const organizerUpdateResponse = await calendar.events.update({
			calendarId: 'primary',
			eventId: eventId,
			requestBody: updatedEventData,
			sendNotifications: true,
		});
		console.log('[UPDATE] Organizer calendar updated successfully.');

		// 3. Find the main attendee (not the organizer) to update their calendar
		const mainUserAttendee = event.attendees?.find(
			(attendee) => attendee.email !== event.organizer?.email
		);

		// 4. If attendee exists, update their calendar via impersonation
		if (mainUserAttendee && mainUserAttendee.email) {
			console.log(`[UPDATE] Found main user: ${mainUserAttendee.email}. Now updating their event.`);
			try {
				const userAuth = getGoogleAuth(mainUserAttendee.email);
				const userCalendar = google.calendar({ version: 'v3', auth: userAuth });

				await userCalendar.events.update({
					calendarId: 'primary',
					eventId: eventId,
					requestBody: updatedEventData,
					sendNotifications: true,
				});
				console.log(`[UPDATE] Successfully updated event for attendee: ${mainUserAttendee.email}`);
			} catch (impersonationError: any) {
				console.error(`[UPDATE] Failed to update event for attendee ${mainUserAttendee.email}:`, impersonationError.message);
				// Don't block success response if only the attendee update fails
			}
		} else {
			console.log('[UPDATE] No other attendees found or attendee email is missing. Skipping attendee update.');
		}

		return NextResponse.json(organizerUpdateResponse.data);

	} catch (error: any) {
		console.error('[UPDATE] A critical error occurred:', error);
		return NextResponse.json({ error: 'Failed to update event', details: error.message }, { status: 500 });
	}
}