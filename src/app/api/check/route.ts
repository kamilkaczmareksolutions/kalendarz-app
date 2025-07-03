import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';

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
		return NextResponse.json({ message: 'Missing id field' }, { status: 400 });
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
		const response = await calendar.events.list({
			calendarId,
			q: `Identyfikator wydarzenia: ${id}`,
			timeMin: new Date(0).toISOString(),
			maxResults: 1,
			singleEvents: true,
			orderBy: 'startTime',
		});

		const eventExists = (response.data.items?.length ?? 0) > 0;
		return NextResponse.json({ exists: eventExists, version: '1.0.1' });
	} catch (error) {
		console.error('Error checking event:', error);
		return NextResponse.json(
			{ message: 'Error checking event' },
			{ status: 500 }
		);
	}
}