const infrastructureFailure = /\b(?:ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENOENT|EACCES|EPERM|ERR_[A-Z_]+|SQLITE_[A-Z_]+)\b|failed to fetch|request failed|socket hang up|database is locked|no such (?:table|column)|error invoking remote method|cannot read properties|is not a function|\b(?:TypeError|ReferenceError|RangeError):|\bat\s+(?:file:|[A-Z]:\\|\/)/i;

export function userFacingError(error: unknown, fallback: string, diagnosticsEnabled = false): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!message.trim()) return fallback;
  if (diagnosticsEnabled || !infrastructureFailure.test(message)) return message;
  return fallback;
}
