import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

const SCOPES = ["https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/calendar.events"];

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-webhook-token");
  if (token !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json(
      { message: "Forbidden – invalid token" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { slot, name, phone, email } = body;

  if (!slot || !name || !phone || !email) {
    return NextResponse.json(
      { message: "Missing fields: slot, name, phone, email" },
      { status: 400 }
    );
  }

  const start = dayjs(slot).tz("Europe/Warsaw");
  const end = start.add(30, "minutes");

  const calendarId = process.env.GOOGLE_CALENDAR_ID!;

  const calendar = google.calendar({
    version: "v3",
    auth: new google.auth.JWT({
      email: process.env.GOOGLE_CLIENT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: SCOPES,
      subject: "kamil.kaczmarek@lejki.pro"
    }),
  });

  const freeBusy = await calendar.freebusy.query({
    requestBody: {
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      timeZone: "Europe/Warsaw",
      items: [{ id: calendarId }],
    },
  });

  const isBusy = freeBusy.data.calendars?.[calendarId]?.busy?.length ?? 0;
  if (isBusy > 0) {
    return NextResponse.json(
      { reserved: false, message: "Slot is already taken" },
      { status: 409 }
    );
  }
  const description = `Dane klienta:
  Imię i nazwisko: ${name}
  Telefon: ${phone}
  E-mail: ${email}`;

  const event = await calendar.events.insert({
    calendarId,
    conferenceDataVersion: 1,
    sendUpdates: 'all',
    requestBody: {
      summary: 'Spotkanie z klientem',
      description,
      start: {
        dateTime: start.format(),
        timeZone: 'Europe/Warsaw',
      },
      end: {
        dateTime: end.format(),
        timeZone: 'Europe/Warsaw',
      },
      conferenceData: {
        createRequest: {
          requestId: `meet-${Date.now()}`,
          conferenceSolutionKey: {
            type: 'hangoutsMeet',
          },
        },
      },
      attendees: [
        { email: email },
      ],
    },
  })

  return NextResponse.json({
    reserved: true,
    start: start.format(),
    end: end.format(),
    eventId: event.data.id,
    eventLink: event.data.htmlLink,
    version: "v1.0.3",
    // meetLink: event.data.conferenceData?.entryPoints?.[0]?.uri || event.data.hangoutLink,
  });
  
}
