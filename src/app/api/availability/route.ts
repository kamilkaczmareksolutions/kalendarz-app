import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { getGoogleAuth } from '@/lib/google';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Europe/Warsaw');

const WORKING_HOURS = {
	start: { hour: 12, minute: 0 },
	end: { hour: 16, minute: 0 },
};
const SLOT_DURATION_MINUTES = 30;

export async function POST(request: NextRequest) {
	console.log('[AVAILABILITY] Received request to check availability.');
	try {
		// Make the body parsing robust to handle cases where it might be empty
		const bodyText = await request.text();
		const body = bodyText ? JSON.parse(bodyText) : {};
		const { startDate: requestedStartDate } = body;

		console.log(`[AVAILABILITY] Requested start date: ${requestedStartDate}`);

		const auth = getGoogleAuth();
		const calendar = google.calendar({ version: 'v3', auth });

		const today = dayjs().startOf('day');
		const startDate = requestedStartDate ? dayjs(requestedStartDate).startOf('day') : today;
		
		// Ensure we don't check for dates in the past, unless a specific future date is requested
		const finalStartDate = startDate.isBefore(today) ? today : startDate;

		const timeMin = finalStartDate.toISOString();
		const timeMax = finalStartDate.add(1, 'month').endOf('month').toISOString();
		
		console.log(`[AVAILABILITY] Checking free/busy for calendar: ${process.env.GOOGLE_IMPERSONATION_EMAIL}`);
		console.log(`[AVAILABILITY] Range: ${timeMin} to ${timeMax}`);
		console.log(`[AVAILABILITY] Impersonating: ${process.env.GOOGLE_IMPERSONATION_EMAIL}`);

		const freeBusyResponse = await calendar.freebusy.query({
			requestBody: {
				timeMin: timeMin,
				timeMax: timeMax,
				timeZone: 'Europe/Warsaw',
				items: [{ id: 'primary' }],
			},
		});

		const busySlots = freeBusyResponse.data.calendars?.primary?.busy ?? [];
		console.log('[AVAILABILITY] Raw free/busy response from Google:', JSON.stringify(busySlots, null, 2));

		const availableSlots = [];
		let currentDate = finalStartDate;

		while (availableSlots.length < 10 && currentDate.isBefore(dayjs(timeMax))) {
			// Skip weekends
			if (currentDate.day() !== 0 && currentDate.day() !== 6) {
				const workingHoursStart = currentDate.hour(WORKING_HOURS.start.hour).minute(WORKING_HOURS.start.minute);
				const workingHoursEnd = currentDate.hour(WORKING_HOURS.end.hour).minute(WORKING_HOURS.end.minute);

				let potentialSlot = workingHoursStart;

				while (potentialSlot.add(SLOT_DURATION_MINUTES, 'minutes').isBefore(workingHoursEnd)) {
					const slotEnd = potentialSlot.add(SLOT_DURATION_MINUTES, 'minutes');

					// Check if slot is in the future
					if (potentialSlot.isAfter(dayjs())) {
						const isBusy = busySlots.some(busy =>
							dayjs(potentialSlot).isBefore(dayjs(busy.end)) && dayjs(slotEnd).isAfter(dayjs(busy.start))
						);

						if (!isBusy) {
							availableSlots.push(potentialSlot.toISOString());
							if (availableSlots.length >= 10) break;
						}
					}
					potentialSlot = potentialSlot.add(SLOT_DURATION_MINUTES, 'minutes');
				}
			}
			currentDate = currentDate.add(1, 'day').startOf('day');
		}

		console.log('[AVAILABILITY] Found available slots:', availableSlots);
		return NextResponse.json({ slots: availableSlots });

	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'An unknown error occurred';
		console.error('[AVAILABILITY] A critical error occurred:', error);
		return NextResponse.json({ error: 'Failed to get availability', details: message }, { status: 500 });
	}
}