import { google } from 'googleapis';

export function getGoogleAuth() {
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const impersonationEmail = process.env.GOOGLE_IMPERSONATION_EMAIL;

  if (!privateKey || !clientEmail || !impersonationEmail) {
    throw new Error(
      'Missing Google credentials. Ensure GOOGLE_PRIVATE_KEY, GOOGLE_SERVICE_ACCOUNT_EMAIL, and GOOGLE_IMPERSONATION_EMAIL are set.',
    );
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/calendar.events.readonly'],
    subject: impersonationEmail,
  });

  return auth;
} 