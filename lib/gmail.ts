import { google } from 'googleapis';

export const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function fetchGmailEmails(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: 'v1', auth });

  try {
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: 'subject:"compra" OR subject:"notificación"',
    });

    const messages = response.data.messages || [];
    const emailDetails = await Promise.all(
      messages.map(async (message) => {
        const email = await gmail.users.messages.get({
          userId: 'me',
          id: message.id!,
        });
        return email.data;
      })
    );

    return emailDetails;
  } catch (error) {
    console.error('Error fetching emails:', error);
    throw new Error('Failed to fetch emails from Gmail.');
  }
}
