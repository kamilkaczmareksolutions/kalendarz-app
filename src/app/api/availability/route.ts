import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { dayjs } from '@/lib/dayjs';
import { z } from 'zod';

// Uproszczony schemat walidacji - oczekujemy teraz na daty z n8n
const availabilityQuerySchema = z.object({
  startDate: z.string().transform((str) => dayjs(str).startOf('day')),
  endDate: z.string().transform((str) => dayjs(str).endOf('day')),
});

const WORKING_HOURS = {
  start: 12,
  end: 16,
};

export async function GET(request: NextRequest) {
  const serviceAccountAuth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar.events.readonly'],
  });

  const calendar = google.calendar({
    version: 'v3',
    auth: serviceAccountAuth,
  });

  try {
    const query = Object.fromEntries(request.nextUrl.searchParams);
    const parsedQuery = availabilityQuerySchema.safeParse(query);

    if (!parsedQuery.success) {
      return NextResponse.json({ error: 'Invalid query parameters', details: parsedQuery.error.flatten() }, { status: 400 });
    }

    const { startDate, endDate } = parsedQuery.data;

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

    return NextResponse.json({ availableSlots });
  } catch (error) {
    console.error('Error fetching availability:', error);
    return NextResponse.json({ error: 'Failed to fetch availability' }, { status: 500 });
  }
}