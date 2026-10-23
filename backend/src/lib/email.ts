interface SendEmailParams {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}

export async function sendEmail({ apiKey, from, to, subject, text }: SendEmailParams): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to, subject, text }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha ao enviar email (${response.status}): ${body}`);
  }
}
