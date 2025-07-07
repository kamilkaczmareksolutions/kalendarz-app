import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

export async function POST(req: NextRequest) {
	console.log('[CHECK] Received request. Processing...');
	const token = req.headers.get('x-webhook-token');
	if (token !== process.env.WEBHOOK_SECRET) {
		return NextResponse.json(
			{ message: 'Forbidden – invalid token' },
			{ status: 403 }
		);
	}

	console.log('[CHECK] Token validated.');
	const body = await req.json();
	console.log('[CHECK] Raw request body:', JSON.stringify(body, null, 2));
	const { id } = body;
	console.log(`[CHECK] Destructured data: id=${id}`);

	if (!id) {
		return NextResponse.json({ message: 'Missing field: id' }, { status: 400 });
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
		const now = dayjs.tz(undefined, 'Europe/Warsaw').toISOString();
		const searchQuery = `Identyfikator wydarzenia: ${id}`;
		console.log(`[CHECK] Searching for event with query: "${searchQuery}"`);

		const response = await calendar.events.list({
			calendarId,
			timeMin: now,
			q: searchQuery,
			singleEvents: true,
			orderBy: 'startTime',
		});

		console.log('[CHECK] Raw response from Google Calendar API:', JSON.stringify(response.data, null, 2));

		if (response.data.items && response.data.items.length > 0) {
			console.log('[CHECK] Event found.');
			return NextResponse.json({
				hasBooking: true,
				event: response.data.items[0],
			});
		} else {
			console.log('[CHECK] Event not found.');
			return NextResponse.json({ hasBooking: false });
		}
	} catch (error) {
		console.error('Error checking for booking:', error);
		return NextResponse.json(
			{ message: 'An error occurred while checking for booking.' },
			{ status: 500 }
		);
	}
}