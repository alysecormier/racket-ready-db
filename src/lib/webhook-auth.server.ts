import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verifies Twilio's X-Twilio-Signature HMAC-SHA1 header.
 * Algorithm: base64(HMAC-SHA1(authToken, url + sortedKey1+value1 + sortedKey2+value2...))
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function verifyTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  headerSignature: string | null,
): boolean {
  if (!headerSignature) return false;
  const sortedKeys = Object.keys(params).sort();
  const data = sortedKeys.reduce((acc, k) => acc + k + params[k], url);
  const expected = createHmac("sha1", authToken).update(data).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(headerSignature);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function requireCronSecret(request: Request): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return new Response("CRON_SECRET not configured", { status: 500 });
  }
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return new Response("Unauthorized", { status: 401 });
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return new Response("Unauthorized", { status: 401 });
  try {
    if (!timingSafeEqual(a, b)) return new Response("Unauthorized", { status: 401 });
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
