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
	const now = dayjs().tz('Europe/Warsaw');

	const timeMin = now.add(1, 'day').startOf('day').toISOString();
	const timeMax = now.add(8, 'days').endOf('day').toISOString();

	try {
		const response = await calendar.freebusy.query({
			requestBody: {
				timeMin,
				timeMax,
				timeZone: 'Europe/Warsaw',
				items: [{ id: calendarId }],
			},
		});

		const busySlots = response.data.calendars?.[calendarId]?.busy ?? [];
		const availableSlots = [];
		let currentDate = now.add(1, 'day').startOf('day');
		const endDate = now.add(8, 'days').endOf('day');

		while (currentDate.isBefore(endDate) && availableSlots.length < 100) {
			const workingHoursStart = currentDate.hour(12).minute(0).second(0);
			const workingHoursEnd = currentDate.hour(16).minute(0).second(0);

			if (currentDate.day() !== 0 && currentDate.day() !== 6) {
				let slotStart = workingHoursStart;
				while (slotStart.isBefore(workingHoursEnd)) {
					const slotEnd = slotStart.add(1, 'hour');
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
					}
					slotStart = slotStart.add(30, 'minutes');
				}
			}
			currentDate = currentDate.add(1, 'day');
		}

		return NextResponse.json({
			availableSlots: availableSlots.slice(0, 5),
			version: '1.0.2',
		});
	} catch (error) {
		console.error('Error fetching free/busy times:', error);
		return NextResponse.json(
			{ message: 'Error fetching availability' },
			{ status: 500 }
		);
	}
}