import { Resend } from 'resend'

export const resend = new Resend(process.env.RESEND_API_KEY)

export type SendEmailParams = {
  to: string | string[]
  subject: string
  html: string
  from?: string
}

export async function sendEmail({ to, subject, html, from }: SendEmailParams) {
  return resend.emails.send({
    from: from ?? process.env.RESEND_FROM_EMAIL ?? 'Mideli <noreply@mideli.com>',
    to,
    subject,
    html,
  })
}
