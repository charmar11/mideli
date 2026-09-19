import { Resend } from 'resend'

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    throw new Error('RESEND_API_KEY no está configurada')
  }

  return new Resend(apiKey)
}

export type SendEmailParams = {
  to: string | string[]
  subject: string
  html: string
  from?: string
}

export async function sendEmail({ to, subject, html, from }: SendEmailParams) {
  const resend = getResendClient()

  return resend.emails.send({
    from: from ?? process.env.RESEND_FROM_EMAIL ?? 'Mideli <noreply@mideli.com>',
    to,
    subject,
    html,
  })
}
