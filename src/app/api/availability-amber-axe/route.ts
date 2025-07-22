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
  end: 22,
};
const SLOT_DURATION_MINUTES = 30;
const BOOKING_BUFFER_MINUTES = 90;
const TIMEZONE = 'Europe/Warsaw';

interface TimeSlot {
  time: dayjs.Dayjs;
  isAvailable: boolean;
}

interface AvailabilityRange {
  start: string;
  end: string;
}

export async function POST(request: NextRequest) {
  console.log('[AVAILABILITY_AMBER_AXE_V2] Received request for available slots.');
  try {
    const auth = getAmberAxeGoogleAuth();
    const calendar = google.calendar({ version: 'v3', auth });
    const body = await request.json();
    console.log('[AVAILABILITY_AMBER_AXE_V2] Raw request body:', JSON.stringify(body, null, 2));

    const parsedQuery = availabilityQuerySchema.safeParse(body);
    if (!parsedQuery.success) {
      console.error('[AVAILABILITY_AMBER_AXE_V2] Validation failed:', parsedQuery.error.flatten());
      return NextResponse.json({ error: 'Validation failed', details: parsedQuery.error.format() }, { status: 400 });
    }

    const { startDate, endDate } = parsedQuery.data;
    const rawCalendarId = process.env.AMBER_AXE_GOOGLE_CALENDAR_ID;

    if (!rawCalendarId) {
      throw new Error('AMBER_AXE_GOOGLE_CALENDAR_ID is not set.');
    }
    const calendarId = decodeURIComponent(rawCalendarId);

    console.log(`[AVAILABILITY_AMBER_AXE_V2] Checking for range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    const calendarResponse = await calendar.events.list({
      calendarId,
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const busySlots = calendarResponse.data.items?.map((event: calendar_v3.Schema$Event) => ({
      start: dayjs(event.start?.dateTime || event.start?.date),
      end: dayjs(event.end?.dateTime || event.end?.date),
    })) ?? [];
    console.log(`[AVAILABILITY_AMBER_AXE_V2] Found ${busySlots.length} busy slots.`);

    const availableDays: { date: string; ranges: AvailabilityRange[] }[] = [];
    let currentDate = startDate.clone();
    const nowWithBuffer = dayjs().tz(TIMEZONE).add(BOOKING_BUFFER_MINUTES, 'minutes');

    while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, 'day')) {
      const allSlots: TimeSlot[] = [];
      for (let hour = WORKING_HOURS.start; hour < WORKING_HOURS.end; hour++) {
        for (let minute = 0; minute < 60; minute += SLOT_DURATION_MINUTES) {
          const slotTime = dayjs.tz(currentDate, TIMEZONE).hour(hour).minute(minute).second(0);
          if (slotTime.hour() >= WORKING_HOURS.end) continue;

          const isSlotBooked = busySlots.some(busySlot =>
            slotTime.isBetween(busySlot.start, busySlot.end, null, '[)')
          );
          
          allSlots.push({
            time: slotTime,
            isAvailable: !isSlotBooked && slotTime.isAfter(nowWithBuffer),
          });
        }
      }

      const availabilityRanges: AvailabilityRange[] = [];
      let currentRange: { start: dayjs.Dayjs | null, end: dayjs.Dayjs | null } = { start: null, end: null };

      for (const slot of allSlots) {
        if (slot.isAvailable) {
          if (!currentRange.start) {
            currentRange.start = slot.time;
          }
          currentRange.end = slot.time;
        } else {
          if (currentRange.start && currentRange.end) {
            availabilityRanges.push({
              start: currentRange.start.format('HH:mm'),
              end: currentRange.end.add(SLOT_DURATION_MINUTES, 'minutes').format('HH:mm'),
            });
          }
          currentRange = { start: null, end: null };
        }
      }
      if (currentRange.start && currentRange.end) {
        availabilityRanges.push({
          start: currentRange.start.format('HH:mm'),
          end: currentRange.end.add(SLOT_DURATION_MINUTES, 'minutes').format('HH:mm'),
        });
      }

      if (availabilityRanges.length > 0) {
        availableDays.push({
          date: currentDate.format('YYYY-MM-DD'),
          ranges: availabilityRanges,
        });
      }
      currentDate = currentDate.add(1, 'day');
    }

    console.log(`[AVAILABILITY_AMBER_AXE_V2] Returning grouped availability for ${availableDays.length} days.`);
    return NextResponse.json({ availableDays });

  } catch (error) {
    console.error('[AVAILABILITY_AMBER_AXE_V2] A critical error occurred:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to fetch availability', details: errorMessage }, { status: 500 });
  }
} 