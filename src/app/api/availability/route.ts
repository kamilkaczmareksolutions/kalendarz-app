import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { getGoogleAuth } from '@/lib/google';

dayjs.extend(utc);
dayjs.extend(timezone);

const TIMEZONE = 'Europe/Warsaw';
dayjs.tz.setDefault(TIMEZONE);

const WORKING_HOURS = {
	start: { hour: 12, minute: 0 },
	end: { hour: 16, minute: 0 },
};
const SLOT_DURATION_MINUTES = 30;

export async function POST(request: NextRequest) {
	console.log('[AVAILABILITY] Received request to check availability.');
	try {
		// We must consume the request body for the POST request to complete,
		// but we will deliberately ignore its contents to enforce our own business logic.
		await request.text();

		// Even if a start date is requested, we ignore it for now to enforce our logic.
		// The primary goal is to ensure we always start from a clean, reliable point.
		console.log(`[AVAILABILITY] Ignoring any requested start date to enforce business logic.`);

		const auth = getGoogleAuth();
		const calendar = google.calendar({ version: 'v3', auth });
		
		// --- START OF CRITICAL CHANGE ---
		// The root cause of the bug was inconsistent timezone handling.
		// We are now explicitly setting the start for our search to be the
		// beginning of *tomorrow* in the Polish timezone. This removes all ambiguity.
		const searchStartDate = dayjs.tz(new Date(), TIMEZONE).add(1, 'day').startOf('day');
		// --- END OF CRITICAL CHANGE ---

		const timeMin = searchStartDate.toISOString();
		// We search a 1-month window from our calculated start date.
		const timeMax = searchStartDate.add(1, 'month').endOf('month').toISOString();
		
		console.log(`[AVAILABILITY] Checking free/busy for calendar: ${process.env.GOOGLE_IMPERSONATION_EMAIL}`);
		console.log(`[AVAILABILITY] Search starts from (UTC): ${timeMin}`);
		console.log(`[AVAILABILITY] Search ends at (UTC): ${timeMax}`);
		console.log(`[AVAILABILITY] Impersonating: ${process.env.GOOGLE_IMPERSONATION_EMAIL}`);

		const freeBusyResponse = await calendar.freebusy.query({
			requestBody: {
				timeMin: timeMin,
				timeMax: timeMax,
				timeZone: TIMEZONE,
				items: [{ id: 'primary' }],
			},
		});

		const busySlots = freeBusyResponse.data.calendars?.primary?.busy ?? [];
		console.log('[AVAILABILITY] Raw free/busy response from Google:', JSON.stringify(busySlots, null, 2));

		const availableSlots = [];
		// Start the loop from our reliable, calculated start date.
		let currentDate = searchStartDate;

		while (availableSlots.length < 10 && currentDate.isBefore(dayjs(timeMax))) {
			// Skip weekends
			if (currentDate.day() !== 0 && currentDate.day() !== 6) {
				const workingHoursStart = currentDate.hour(WORKING_HOURS.start.hour).minute(WORKING_HOURS.start.minute);
				const workingHoursEnd = currentDate.hour(WORKING_HOURS.end.hour).minute(WORKING_HOURS.end.minute);

				let potentialSlot = workingHoursStart;

				while (potentialSlot.add(SLOT_DURATION_MINUTES, 'minutes').isBefore(workingHoursEnd)) {
					const slotEnd = potentialSlot.add(SLOT_DURATION_MINUTES, 'minutes');

					// Check if slot is in the future (compared against now in the correct timezone)
					if (potentialSlot.isAfter(dayjs.tz(new Date(), TIMEZONE))) {
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