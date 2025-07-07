import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

export async function POST(req: NextRequest) {
	const token = req.headers.get('x-webhook-token');
	if (token !== process.env.WEBHOOK_SECRET) {
		return NextResponse.json(
			{ message: 'Forbidden – invalid token' },
			{ status: 403 }
		);
	}

	const body = await req.json();
	const { id } = body;

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

		const response = await calendar.events.list({
			calendarId,
			timeMin: now,
			q: id,
			singleEvents: true,
			orderBy: 'startTime',
		});

		if (response.data.items && response.data.items.length > 0) {
			return NextResponse.json({
				hasBooking: true,
				event: response.data.items[0],
			});
		} else {
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