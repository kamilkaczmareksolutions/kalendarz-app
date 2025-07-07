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
	const { date } = body;

	if (!date) {
		return NextResponse.json(
			{ message: 'Missing required fields: date' },
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
		const startOfMonth = dayjs.tz(date, 'Europe/Warsaw').startOf('month');
		const endOfMonth = dayjs.tz(date, 'Europe/Warsaw').endOf('month');

		console.log(`[AVAILABILITY] Checking free/busy for calendar: ${calendarId}`);
		console.log(`[AVAILABILITY] Range: ${startOfMonth.toISOString()} to ${endOfMonth.toISOString()}`);
		console.log(`[AVAILABILITY] Impersonating: ${impersonationEmail}`);

		// Get busy times
		const freeBusyResponse = await calendar.freebusy.query({
			requestBody: {
				timeMin: startOfMonth.toISOString(),
				timeMax: endOfMonth.toISOString(),
				timeZone: 'Europe/Warsaw',
				items: [{ id: calendarId }],
			},
		});

		const calendarBusyData = freeBusyResponse.data.calendars?.[calendarId];
		console.log('[AVAILABILITY] Raw free/busy response from Google:', JSON.stringify(calendarBusyData, null, 2));

		const busySlots = calendarBusyData?.busy ?? [];

		if (busySlots.length > 0) {
			console.log(`[AVAILABILITY] Found ${busySlots.length} busy slots.`);
		} else {
			console.log('[AVAILABILITY] No busy slots returned from Google for this period.');
		}
		
		const availableSlots: string[] = [];
		const now = dayjs.tz(undefined, 'Europe/Warsaw');

		let currentDay = now.clone();

		while (currentDay.isBefore(endOfMonth) && availableSlots.length < 3) {
			const dayOfWeek = currentDay.day();

			if (dayOfWeek >= 1 && dayOfWeek <= 5) {
				const startHour = 12;
				const endHour = 16;

				for (let hour = startHour; hour < endHour; hour++) {
					const slot = currentDay.hour(hour).minute(0).second(0).millisecond(0);

					// Skip slots that are in the past
					if (slot.isBefore(now)) {
						continue;
					}

					const isBusy = busySlots.some(busySlot => {
						const busyStart = dayjs(busySlot.start);
						const busyEnd = dayjs(busySlot.end);
						return slot.isAfter(busyStart) && slot.isBefore(busyEnd);
					});

					if (!isBusy) {
						availableSlots.push(slot.format());
					}
				}
			}
			currentDay = currentDay.add(1, 'day');
		}

		return NextResponse.json({ availableSlots, version: '1.0.1' });
	} catch (error) {
		console.error('Error fetching availability:', error);
		return NextResponse.json(
			{ message: 'An error occurred while fetching availability.' },
			{ status: 500 }
		);
	}
}