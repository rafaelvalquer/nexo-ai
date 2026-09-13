import type { ConnectionCapability } from "@nexo/shared";

export const GOOGLE_SCOPES = {
  openid: "openid",
  email: "email",
  profile: "profile",
  mail: "https://mail.google.com/",
  gmailReadonly: "https://www.googleapis.com/auth/gmail.readonly",
  gmailSend: "https://www.googleapis.com/auth/gmail.send",
  gmailModify: "https://www.googleapis.com/auth/gmail.modify",
  calendarReadonly: "https://www.googleapis.com/auth/calendar.readonly",
  calendar: "https://www.googleapis.com/auth/calendar"
} as const;

export const GOOGLE_BASE_SCOPES = [GOOGLE_SCOPES.openid, GOOGLE_SCOPES.email, GOOGLE_SCOPES.profile] as const;

export const GOOGLE_SCOPE_BY_CAPABILITY: Record<ConnectionCapability, string> = {
  "email.read": GOOGLE_SCOPES.gmailReadonly,
  "email.send": GOOGLE_SCOPES.gmailSend,
  "email.modify": GOOGLE_SCOPES.gmailModify,
  "calendar.read": GOOGLE_SCOPES.calendarReadonly,
  "calendar.write": GOOGLE_SCOPES.calendar
};

export function normalizeGoogleScopes(capabilities: ConnectionCapability[]): string[] {
  const requested = new Set(capabilities);
  const scopes = new Set<string>(GOOGLE_BASE_SCOPES);

  if (requested.has("email.modify")) {
    // gmail.modify already covers reading, composing and sending. Requesting readonly/send
    // as well makes consent harder to reason about without granting any useful extra power.
    scopes.add(GOOGLE_SCOPES.gmailModify);
  } else {
    if (requested.has("email.read")) scopes.add(GOOGLE_SCOPES.gmailReadonly);
    if (requested.has("email.send")) scopes.add(GOOGLE_SCOPES.gmailSend);
  }

  if (requested.has("calendar.write")) {
    // calendar covers both read and write for the current CalendarService surface.
    scopes.add(GOOGLE_SCOPES.calendar);
  } else if (requested.has("calendar.read")) {
    scopes.add(GOOGLE_SCOPES.calendarReadonly);
  }

  return [...scopes];
}

export function expectedGoogleScopes(capability: ConnectionCapability): string[] {
  switch (capability) {
    case "email.read":
      return [GOOGLE_SCOPES.gmailReadonly, GOOGLE_SCOPES.gmailModify, GOOGLE_SCOPES.mail];
    case "email.send":
      return [GOOGLE_SCOPES.gmailSend, GOOGLE_SCOPES.gmailModify, GOOGLE_SCOPES.mail];
    case "email.modify":
      return [GOOGLE_SCOPES.gmailModify, GOOGLE_SCOPES.mail];
    case "calendar.read":
      return [GOOGLE_SCOPES.calendarReadonly, GOOGLE_SCOPES.calendar];
    case "calendar.write":
      return [GOOGLE_SCOPES.calendar];
  }
}

export function supportingGoogleScope(scopes: string[], capability: ConnectionCapability): string | undefined {
  const available = new Set(scopes);
  return expectedGoogleScopes(capability).find(scope => available.has(scope));
}

export function googleScopeSupports(scopes: string[], capability: ConnectionCapability): boolean {
  return Boolean(supportingGoogleScope(scopes, capability));
}

export function capabilityLabel(capability: ConnectionCapability): string {
  return ({
    "email.read": "Ler e-mails",
    "email.send": "Enviar e-mails",
    "email.modify": "Alterar e-mails",
    "calendar.read": "Ler agenda",
    "calendar.write": "Alterar agenda"
  } as Record<ConnectionCapability, string>)[capability];
}
