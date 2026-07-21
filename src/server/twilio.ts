import twilio from 'twilio'

export const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

export type SendSMSParams = {
  to: string
  body: string
  from?: string
}

export async function sendSMS({ to, body, from }: SendSMSParams) {
  return twilioClient.messages.create({
    body,
    to,
    from: from ?? process.env.TWILIO_PHONE_NUMBER,
  })
}
