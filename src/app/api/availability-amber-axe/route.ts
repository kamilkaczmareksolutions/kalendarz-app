import { NextRequest, NextResponse } from 'next/server';
import { google, calendar_v3 } from 'googleapis';
import { dayjs } from '@/lib/dayjs';
import { z } from 'zod';
import { getAmberAxeGoogleAuth } from '@/lib/google';

const availabilityQuerySchema = z.object({
  startDate: z.string().transform((str) => dayjs(str).startOf('day')),
  endDate: z.string().transform((str) => dayjs(str).endOf('day')),
});

const WORKING_HOURS = {
  start: 12,
  end: 22, // Pętla wykona się dla godzin 12:00 - 21:00
};

const TIMEZONE = 'Europe/Warsaw';

export async function POST(request: NextRequest) {
  console.log('[AVAILABILITY_AMBER_AXE] Received request for available slots.');
  try {
    const auth = getAmberAxeGoogleAuth();
    
    const calendar = google.calendar({
      version: 'v3',
      auth: auth,
    });

    const body = await request.json();
    console.log('[AVAILABILITY_AMBER_AXE] Raw request body:', JSON.stringify(body, null, 2));
    const parsedQuery = availabilityQuerySchema.safeParse(body);

    if (!parsedQuery.success) {
      console.error('[AVAILABILITY_AMBER_AXE] Validation failed:', parsedQuery.error.flatten());
      return NextResponse.json({ error: 'Validation failed', details: parsedQuery.error.format() }, { status: 400 });
    }

    const { startDate, endDate } = parsedQuery.data;
    const calendarId = process.env.AMBER_AXE_GOOGLE_CALENDAR_ID;

    if (!calendarId) {
      throw new Error('AMBER_AXE_GOOGLE_CALENDAR_ID is not set.');
    }

    console.log(`[AVAILABILITY_AMBER_AXE] Checking for range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    const calendarResponse = await calendar.events.list({
      calendarId: calendarId,
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const busySlots = calendarResponse.data.items?.map((event: calendar_v3.Schema$Event) => ({
      start: dayjs(event.start?.dateTime),
      end: dayjs(event.end?.dateTime),
    })) ?? [];
    console.log(`[AVAILABILITY_AMBER_AXE] Found ${busySlots.length} busy slots.`);

    const availableSlots: { time: string; isAvailable: boolean }[] = [];
    let currentDate = startDate.clone();
    const todayInWarsaw = dayjs().tz(TIMEZONE);

    while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, 'day')) {
      // Usunięto warunek sprawdzający weekendy
      for (let hour = WORKING_HOURS.start; hour < WORKING_HOURS.end; hour++) {
        const slotTime = dayjs.tz(currentDate, TIMEZONE).hour(hour).minute(0).second(0);
        
        const isSlotBooked = busySlots.some((busySlot: { start: dayjs.Dayjs, end: dayjs.Dayjs }) =>
          slotTime.isBetween(busySlot.start, busySlot.end, null, '[)')
        );

        if (!isSlotBooked && slotTime.isAfter(todayInWarsaw)) {
          availableSlots.push({
            time: slotTime.toISOString(),
            isAvailable: true,
          });
        }
      }
      currentDate = currentDate.add(1, 'day');
    }

    console.log(`[AVAILABILITY_AMBER_AXE] Returning ${availableSlots.length} available slots.`);
    return NextResponse.json({ availableSlots });
  } catch (error) {
    console.error('[AVAILABILITY_AMBER_AXE] A critical error occurred:', error);
    return NextResponse.json({ error: 'Failed to fetch availability' }, { status: 500 });
  }
} 