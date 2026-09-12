const contentKeys = new Set(["body", "bodytext", "content", "prompt", "text", "snippet", "description", "htmlbody"]);
const recipientKeys = new Set(["to", "cc", "bcc", "recipients", "attendees"]);
const secretKeys = new Set(["access_token", "refresh_token", "token", "authorization", "password", "secret"]);

export function redactAuditDetails(value: unknown, key = ""): unknown {
  const normalized = key.toLowerCase();
  if (secretKeys.has(normalized)) return "[REDACTED]";
  if (contentKeys.has(normalized) && typeof value === "string") return { redacted: true, length: value.length };
  if (recipientKeys.has(normalized) && Array.isArray(value)) return { count: value.length };
  if (Array.isArray(value)) return value.map(item => redactAuditDetails(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [childKey, redactAuditDetails(childValue, childKey)]));
  return value;
}
