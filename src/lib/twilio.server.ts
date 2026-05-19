// Twilio SMS helper — routes through the Lovable connector gateway.
const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

export async function sendSms(to: string, body: string): Promise<{ sid?: string; error?: string }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const twilioKey = process.env.TWILIO_API_KEY;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!lovableKey || !twilioKey || !from) {
    console.error("Twilio env vars missing", { lovableKey: !!lovableKey, twilioKey: !!twilioKey, from: !!from });
    return { error: "twilio not configured" };
  }
  if (!to) return { error: "no destination phone" };

  try {
    const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": twilioKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    const data: any = await res.json();
    if (!res.ok) {
      console.error("Twilio API error", res.status, data);
      return { error: `${res.status}: ${JSON.stringify(data)}` };
    }
    return { sid: data.sid };
  } catch (e) {
    console.error("Twilio send failed", e);
    return { error: String(e) };
  }
}
