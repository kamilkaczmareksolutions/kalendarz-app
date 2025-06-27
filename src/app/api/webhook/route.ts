import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'
import dayjs from 'dayjs'
import isBetween from 'dayjs/plugin/isBetween'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(isBetween)

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-webhook-token')
  if (token !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ message: 'Forbidden – invalid token' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) // Pozwalamy na puste body

  const calendar = google.calendar({
    version: 'v3',
    auth: new google.auth.JWT({
      email: process.env.GOOGLE_CLIENT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: SCOPES,
    }),
  })

  // Ustawienia domyślne i parsowanie z body
  const startDate = body.date_from ? dayjs(body.date_from) : dayjs().add(1, 'day')
  const endDate = body.date_to ? dayjs(body.date_to) : dayjs().add(14, 'day')
  const startTime = body.time_from ? parseInt(body.time_from.split(':')[0]) : 9
  const endTime = body.time_to ? parseInt(body.time_to.split(':')[0]) : 17

  const timeMin = startDate.startOf('day').toISOString()
  const timeMax = endDate.endOf('day').toISOString()

  const calendarId = process.env.GOOGLE_CALENDAR_ID!

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: 'Europe/Warsaw',
      items: [{ id: calendarId }],
    },
  })

  const busySlots = response.data.calendars?.[calendarId]?.busy || []
  const availableSlots: string[] = []
  
  let currentDate = startDate.clone()

  while (currentDate.isBefore(endDate.add(1, 'day')) && availableSlots.length < 5) {
      // Tylko poniedziałek–piątek
      if (currentDate.day() !== 0 && currentDate.day() !== 6) {
          for (let hour = startTime; hour < endTime; hour++) {
              for (let minute = 0; minute < 60; minute += 30) {
                  const slotStart = currentDate.hour(hour).minute(minute).second(0)
                  const slotEnd = slotStart.add(30, 'minutes') // Zakładamy spotkania 30 min, można zmienić

                  // Sprawdzenie, czy jest w dozwolonym oknie czasowym
                   if(slotStart.hour() >= startTime && slotEnd.hour() < endTime) {

                      const isBusy = busySlots.some((busy) => {
                          const busyStart = dayjs(busy.start!)
                          const busyEnd = dayjs(busy.end!)
                          return slotStart.isBefore(busyEnd) && slotEnd.isAfter(busyStart)
                      })

                      if (!isBusy) {
                          availableSlots.push(slotStart.tz('Europe/Warsaw').format())
                          if (availableSlots.length >= 5) break;
                      }
                   }
              }
              if (availableSlots.length >= 5) break;
          }
      }
      currentDate = currentDate.add(1, 'day')
      if (availableSlots.length >= 5) break;
  }
  
  if(availableSlots.length === 0) {
      return NextResponse.json({ slots: false, message: "No available slots found for the given criteria." })
  }

  return NextResponse.json({ slots: availableSlots })
}