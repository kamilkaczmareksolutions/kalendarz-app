import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { dayjs } from '@/lib/dayjs';
import { z } from 'zod';
import { getGoogleAuth } from '@/lib/google';

const availabilityQuerySchema = z.object({
  startDate: z.string().transform((str) => dayjs(str).startOf('day')),
  endDate: z.string().transform((str) => dayjs(str).endOf('day')),
});

const WORKING_HOURS = {
  start: 12,
  end: 16, // The loop will run up to (but not including) 16, so 12, 13, 14, 15.
};

const TIMEZONE = 'Europe/Warsaw';

export async function POST(request: NextRequest) {
  console.log('[AVAILABILITY] Received request for available slots.');
  try {
    const auth = getGoogleAuth();
    
    const calendar = google.calendar({
      version: 'v3',
      auth: auth,
    });

    const body = await request.json();
    console.log('[AVAILABILITY] Raw request body:', JSON.stringify(body, null, 2));
    const parsedQuery = availabilityQuerySchema.safeParse(body);

    if (!parsedQuery.success) {
      console.error('[AVAILABILITY] Validation failed:', parsedQuery.error.flatten());
      return NextResponse.json({ error: 'Invalid body parameters', details: parsedQuery.error.flatten() }, { status: 400 });
    }

    const { startDate, endDate } = parsedQuery.data;
    console.log(`[AVAILABILITY] Checking for range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    const calendarResponse = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const busySlots = calendarResponse.data.items?.map(event => ({
      start: dayjs(event.start?.dateTime),
      end: dayjs(event.end?.dateTime),
    })) ?? [];
    console.log(`[AVAILABILITY] Found ${busySlots.length} busy slots.`);

    const availableSlots: { time: string; isAvailable: boolean }[] = [];
    let currentDate = startDate.clone();

    while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, 'day')) {
      if (currentDate.day() !== 0 && currentDate.day() !== 6) { // Skip weekends
        for (let hour = WORKING_HOURS.start; hour < WORKING_HOURS.end; hour++) {
          
          // --- TIMEZONE FIX ---
          // Create the slot time in the correct timezone ('Europe/Warsaw')
          // This correctly interprets the working hours as Polish time.
          const slotTime = dayjs.tz(currentDate, TIMEZONE).hour(hour).minute(0).second(0);
          
          const isSlotBooked = busySlots.some(busySlot =>
            slotTime.isBetween(busySlot.start, busySlot.end, null, '[)')
          );

          // The comparison is against the server's current time (UTC)
          if (!isSlotBooked && slotTime.isAfter(dayjs())) {
            availableSlots.push({
              time: slotTime.toISOString(), // .toISOString() always returns UTC for the bot
              isAvailable: true,
            });
          }
        }
      }
      currentDate = currentDate.add(1, 'day');
    }

    console.log(`[AVAILABILITY] Returning ${availableSlots.length} available slots.`);
    return NextResponse.json({ availableSlots });
  } catch (error) {
    console.error('[AVAILABILITY] A critical error occurred:', error);
    return NextResponse.json({ error: 'Failed to fetch availability' }, { status: 500 });
  }
}