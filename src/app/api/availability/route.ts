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
	const now = dayjs().tz('Europe/Warsaw');

	const timeMin = now.add(1, 'day').startOf('day').toISOString();
	const timeMax = now.add(8, 'days').endOf('day').toISOString();

	try {
		const startOfMonth = dayjs.tz(now, 'Europe/Warsaw').startOf('month');
		const endOfMonth = dayjs.tz(now, 'Europe/Warsaw').endOf('month');

		console.log(`[AVAILABILITY] Checking free/busy for calendar: ${calendarId}`);
		console.log(`[AVAILABILITY] Range: ${startOfMonth.toISOString()} to ${endOfMonth.toISOString()}`);
		console.log(`[AVAILABILITY] Impersonating: ${impersonationEmail}`);

		const response = await calendar.freebusy.query({
			requestBody: {
				timeMin: startOfMonth.toISOString(),
				timeMax: endOfMonth.toISOString(),
				timeZone: 'Europe/Warsaw',
				items: [{ id: calendarId }],
			},
		});

		const calendarBusyData = response.data.calendars?.[calendarId];
		console.log('[AVAILABILITY] Raw free/busy response from Google:', JSON.stringify(calendarBusyData, null, 2));

		const busySlots = calendarBusyData?.busy ?? [];

		if (busySlots.length > 0) {
			console.log(`[AVAILABILITY] Found ${busySlots.length} busy slots.`);
		} else {
			console.log('[AVAILABILITY] No busy slots returned from Google for this period.');
		}

		const availableSlots = [];
		let currentDate = startOfMonth;
		const endDate = endOfMonth;

		while (currentDate.isBefore(endDate) && availableSlots.length < 5) {
			const workingHoursStart = currentDate.tz('Europe/Warsaw').hour(12).minute(0).second(0);
			const workingHoursEnd = currentDate.tz('Europe/Warsaw').hour(16).minute(0).second(0);

			if (currentDate.day() !== 0 && currentDate.day() !== 6) {
				let slotStart = workingHoursStart;
				let foundSlotForDay = false;
				while (slotStart.isBefore(workingHoursEnd) && !foundSlotForDay) {
					const slotEnd = slotStart.add(30, 'minutes');
					const isBusy = busySlots.some(
						busy =>
							dayjs(busy.start).isBefore(slotEnd) &&
							dayjs(busy.end).isAfter(slotStart)
					);

					if (!isBusy) {
						availableSlots.push({
							start: slotStart.toISOString(),
							end: slotEnd.toISOString(),
						});
						foundSlotForDay = true;
					}
					slotStart = slotStart.add(30, 'minutes');
				}
			}
			currentDate = currentDate.add(1, 'day');
		}

		return NextResponse.json({
			availableSlots: availableSlots,
			version: '1.0.4-daily-slots',
		});
	} catch (error) {
		console.error('Error fetching free/busy times:', error);
		return NextResponse.json(
			{ message: 'Error fetching availability' },
			{ status: 500 }
		);
	}
}