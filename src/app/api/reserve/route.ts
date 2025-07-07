import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

export async function POST(req: NextRequest) {
	const token = req.headers.get('x-webhook-token');
	if (token !== process.env.WEBHOOK_SECRET) {
		return NextResponse.json(
			{ message: 'Forbidden – invalid token' },
			{ status: 403 }
		);
	}

	console.log('[RESERVE] Received request. Processing...');
	const body = await req.json();
	console.log('[RESERVE] Raw request body:', JSON.stringify(body, null, 2));

	const { name, email, phone, slot } = body;
	console.log(`[RESERVE] Destructured data: name=${name}, email=${email}, phone=${phone}, slot=${slot}`);

	if (!name || !email || !phone || !slot) {
		console.error('[RESERVE] Validation failed: Missing required fields.');
		return NextResponse.json(
			{ message: 'Missing required fields: name, email, phone, slot' },
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
		}
	});

	const calendar = google.calendar({ version: 'v3', auth });

	try {
		// NOTE: Logic to check for existing events has been intentionally removed.
		// A new event will always be created upon request to allow multiple bookings.
		const start = dayjs.tz(slot, 'Europe/Warsaw');
		const end = start.add(30, 'minutes');

		// Generate a unique ID for the event to allow for future updates
		const uniqueId = Math.random().toString(36).substring(2, 15);

		const event = {
			summary: `Konsultacja zlec.ai - ${name}`,
			description: `Imię i nazwisko: ${name}\nE-mail: ${email}\nTelefon: ${phone}\nIdentyfikator wydarzenia: ${uniqueId}`,
			start: {
				dateTime: start.toISOString(),
				timeZone: 'Europe/Warsaw',
			},
			end: {
				dateTime: end.toISOString(),
				timeZone: 'Europe/Warsaw',
			},
			attendees: [{ email }],
			reminders: {
				useDefault: true,
			},
		};

		const createdEvent = await calendar.events.insert({
			calendarId,
			requestBody: event,
			sendUpdates: 'all',
		});

		return NextResponse.json(
			{
				reserved: true,
				message: 'Event created successfully',
				event: {
					id: uniqueId,
					summary: createdEvent.data.summary,
					start: createdEvent.data.start?.dateTime,
					end: createdEvent.data.end?.dateTime,
				},
				version: '1.0.5',
			},
			{ status: 201 }
		);
	} catch (error) {
		console.error('Error creating event:', error);
		return NextResponse.json(
			{ message: 'An error occurred while creating the event.' },
			{ status: 500 }
		);
	}
}