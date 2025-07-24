import { NextRequest, NextResponse } from 'next/server';

// --- WAŻNE ---
// Wklej tutaj DOKŁADNIE ten sam token, który wpisujesz w panelu Facebooka
// w polu "Verify Token".
const VERIFY_TOKEN = process.env.FACEBOOK_VERIFY_TOKEN || 'sekretny_test_123';

/**
 * Obsługuje żądania weryfikacyjne od Facebooka (GET).
 * Facebook wysyła to zapytanie, aby upewnić się, że Twój endpoint jest prawidłowy.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  console.log('Otrzymano żądanie weryfikacyjne od Facebooka:');
  console.log(`Mode: ${mode}`);
  console.log(`Token: ${token}`);
  console.log(`Challenge: ${challenge}`);

  // Sprawdza, czy token i tryb są poprawne
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    // Odpowiada wartością "challenge", aby potwierdzić weryfikację
    console.log('Weryfikacja pomyślna. Odpowiadam z challenge.');
    return new NextResponse(challenge, { status: 200 });
  } else {
    // Odpowiada błędem, jeśli tokeny się nie zgadzają
    console.error('Weryfikacja nie powiodła się. Błędny token lub tryb.');
    return new NextResponse('Forbidden', { status: 403 });
  }
}

/**
 * Obsługuje powiadomienia o zdarzeniach od Facebooka (POST).
 * Tutaj będą trafiać wszystkie testowe i prawdziwe zdarzenia.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Loguje całą zawartość otrzymanego zdarzenia do konsoli serwera.
    // To jest kluczowy element naszego testu.
    console.log('--- OTRZYMANO NOWE ZDARZENIE (POST) OD FACEBOOKA ---');
    console.log(JSON.stringify(body, null, 2));
    console.log('----------------------------------------------------');

    // Facebook wymaga odpowiedzi 200 OK, aby wiedzieć, że zdarzenie zostało odebrane.
    return new NextResponse('EVENT_RECEIVED', { status: 200 });
  } catch (error) {
    console.error('Błąd podczas przetwarzania zapytania POST:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 