import { requireAuthenticatedUser, getErrorMessage } from '@/lib/auth-user';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response) return auth.response;

    const secretKey = process.env.FINTOC_SECRET_KEY?.trim();
    if (!secretKey) {
      return NextResponse.json({ error: 'FINTOC_SECRET_KEY no configurada.' }, { status: 500 });
    }

    const res = await fetch('https://api.fintoc.com/v1/link_intents', {
      method: 'POST',
      headers: {
        Authorization: secretKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        product: 'movements',
        country: 'cl',
        holder_type: 'individual',
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Fintoc link_intent error:', text);
      return NextResponse.json({ error: 'No se pudo crear link intent.' }, { status: 502 });
    }

    const data = await res.json() as { widget_token?: string };
    if (!data.widget_token) {
      return NextResponse.json({ error: 'Fintoc no devolvio widget_token.' }, { status: 502 });
    }

    return NextResponse.json({ widget_token: data.widget_token });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}