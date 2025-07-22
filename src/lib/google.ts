import { google } from 'googleapis';

export function getGoogleAuth() {
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const impersonationEmail = process.env.GOOGLE_IMPERSONATION_EMAIL;

  if (!privateKey || !clientEmail || !impersonationEmail) {
    throw new Error(
      'Missing Google credentials. Ensure GOOGLE_PRIVATE_KEY, GOOGLE_SERVICE_ACCOUNT_EMAIL, and GOOGLE_IMPERSONATION_EMAIL are set.',
    );
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
    subject: impersonationEmail,
  });

  return auth;
}

export function getAmberAxeGoogleAuth() {
  const privateKey = process.env.AMBER_AXE_GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.AMBER_AXE_GOOGLE_CLIENT_EMAIL;

  if (!privateKey || !clientEmail) {
    throw new Error(
      'Missing Amber Axe Google credentials. Ensure AMBER_AXE_GOOGLE_PRIVATE_KEY and AMBER_AXE_GOOGLE_CLIENT_EMAIL are set.',
    );
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
    // Usunięto 'subject' (impersonację), ponieważ nie jest ona potrzebna i powodowała błąd.
    // Teraz wystarczy udostępnić kalendarz bezpośrednio na adres email konta serwisowego.
  });

  return auth;
} 