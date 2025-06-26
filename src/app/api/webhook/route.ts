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

import serviceAccount from '@/app/lib/service-account.json'

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-webhook-token')
  if (token !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ message: 'Forbidden – invalid token' }, { status: 403 })
  }

  const calendar = google.calendar({
    version: 'v3',
    auth: new google.auth.JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: SCOPES,
    }),
  })

  const now = dayjs()
  const end = now.add(7, 'day')

  const timeMin = now.toISOString()
  const timeMax = end.toISOString()

  const calendarId = process.env.GOOGLE_CALENDAR_ID!

  // Zapytanie free/busy
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

  const hours = [9, 10, 11, 12, 13, 14, 15, 16] // pełne godziny między 9 a 17
  const daysChecked: Set<string> = new Set()

  for (let i = 1; i < 7; i++) {
    const day = now.add(i, 'day')

    // Tylko poniedziałek–piątek
    if (day.day() === 0 || day.day() === 6) continue

    for (const hour of hours) {
      const start = day.hour(hour).minute(0).second(0)
      const end = start.add(1, 'hour')

      const isBusy = busySlots.some((slot) => {
        const busyStart = dayjs(slot.start!)
        const busyEnd = dayjs(slot.end!)
        return start.isBefore(busyEnd) && end.isAfter(busyStart)
      })

      if (!isBusy && !daysChecked.has(day.format('YYYY-MM-DD'))) {
        availableSlots.push(start.tz('Europe/Warsaw').format())
        daysChecked.add(day.format('YYYY-MM-DD'))
        break // tylko 1 termin dziennie
      }
    }

    if (availableSlots.length >= 3) break
  }

  if (availableSlots.length < 3) {
    return NextResponse.json({ slots: false })
  }

  return NextResponse.json({ slots: availableSlots })
}
