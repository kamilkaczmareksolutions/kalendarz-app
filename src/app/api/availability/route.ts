import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { dayjs } from '@/lib/dayjs';
import { z } from 'zod';
import { getGoogleAuth } from '@/lib/google';

// Uproszczony schemat walidacji - oczekujemy teraz na daty z n8n
const availabilityQuerySchema = z.object({
  startDate: z.string().transform((str) => dayjs(str).startOf('day')),
  endDate: z.string().transform((str) => dayjs(str).endOf('day')),
});

const WORKING_HOURS = {
  start: 12,
  end: 16,
};

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

    // Pobierz wszystkie zajęte terminy w podanym przez n8n zakresie
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
      // Pomiń weekendy
      if (currentDate.day() !== 0 && currentDate.day() !== 6) {
        for (let hour = WORKING_HOURS.start; hour < WORKING_HOURS.end; hour++) {
          const slotTime = currentDate.set('hour', hour).startOf('hour');
          
          const isSlotBooked = busySlots.some(busySlot =>
            slotTime.isBetween(busySlot.start, busySlot.end, null, '[)')
          );

          if (!isSlotBooked && slotTime.isAfter(dayjs())) {
            availableSlots.push({
              time: slotTime.toISOString(),
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