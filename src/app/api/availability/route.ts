import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/google';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrAfter);

export const runtime = 'nodejs';

// --- Konfiguracja ---
const TIME_ZONE = 'Europe/Warsaw';
const WORKING_HOURS = { start: 12, end: 16 };
const SLOT_DURATION = 30; // w minutach
const MAX_DAYS_TO_CHECK = 14; // Maksymalny horyzont czasowy wyszukiwania
// --- Koniec Konfiguracji ---

export async function POST(req: NextRequest) {
    console.log('[AVAILABILITY] Received request to check availability.');

    try {
        const body = await req.json().catch(() => ({}));
        let startDate = dayjs.tz(body.date || new Date(), TIME_ZONE);

        console.log(`[AVAILABILITY] Initial date from request (or now): ${startDate.format()}`);
        
        // Nigdy nie proponuj spotkań na dziś. Zawsze zaczynaj od jutra.
        const tomorrow = dayjs.tz(TIME_ZONE).add(1, 'day').startOf('day');
        if (startDate.isBefore(tomorrow)) {
            startDate = tomorrow;
            console.log(`[AVAILABILITY] Start date was before tomorrow. Reset to tomorrow: ${startDate.format()}`);
        }

        const auth = getGoogleAuth();
        const calendar = google.calendar({ version: 'v3', auth });

        const timeMin = startDate.toISOString();
        const timeMax = startDate.add(MAX_DAYS_TO_CHECK, 'day').endOf('day').toISOString();

        console.log(`[AVAILABILITY] Checking calendar from: ${timeMin} to: ${timeMax}`);

        const calendarResponse = await calendar.events.list({
            calendarId: 'primary',
            timeMin: timeMin,
            timeMax: timeMax,
            singleEvents: true,
            orderBy: 'startTime',
        });

        const busySlots = calendarResponse.data.items?.map(event => ({
            start: dayjs(event.start?.dateTime),
            end: dayjs(event.end?.dateTime),
        })) || [];

        console.log(`[AVAILABILITY] Found ${busySlots.length} busy slots in the given range.`);

        const availableSlots = [];
        let currentDay = startDate.clone();

        for (let i = 0; i < MAX_DAYS_TO_CHECK; i++) {
            // Pomiń weekendy
            if (currentDay.day() !== 0 && currentDay.day() !== 6) {
                let slot = currentDay.hour(WORKING_HOURS.start).minute(0).second(0);
            
                while (slot.hour() < WORKING_HOURS.end) {
                    const slotEnd = slot.add(SLOT_DURATION, 'minutes');
    
                    const isBooked = busySlots.some(busySlot => 
                        (slot.isSame(busySlot.start) || slot.isAfter(busySlot.start)) && slot.isBefore(busySlot.end)
                    );
    
                    if (!isBooked) {
                        availableSlots.push(slot.toISOString());
                    }
                    
                    slot = slotEnd;
                }
            }
            
            if(availableSlots.length >= 5) {
                break;
            }

            currentDay = currentDay.add(1, 'day');
        }
        
        console.log(`[AVAILABILITY] Found ${availableSlots.length} available slots.`);

        return NextResponse.json(
            { availableSlots: availableSlots.slice(0, 5) },
            { status: 200 }
        );

    } catch (error) {
        console.error('Error checking availability:', error);
        return NextResponse.json({ error: 'Failed to check availability.' }, { status: 500 });
    }
}