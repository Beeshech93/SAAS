/**
 * Normalizes a phone number to "+<digits>" (E.164 style) so the same WhatsApp
 * number always maps to the same customer. Returns null if it is not plausible.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s().-]/g, '').replace(/^00/, '+');
  if (!/^\+?[1-9]\d{7,14}$/.test(digits)) return null;
  return digits.startsWith('+') ? digits : `+${digits}`;
}
