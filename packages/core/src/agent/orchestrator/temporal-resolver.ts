export type ResolvedPeriod = { start: string; end: string; label: string };

const weekdays: Record<string, number> = {
  domingo: 0, sunday: 0,
  segunda: 1, "segunda-feira": 1, monday: 1,
  terca: 2, terça: 2, "terça-feira": 2, tuesday: 2,
  quarta: 3, "quarta-feira": 3, wednesday: 3,
  quinta: 4, "quinta-feira": 4, thursday: 4,
  sexta: 5, "sexta-feira": 5, friday: 5,
  sabado: 6, sábado: 6, saturday: 6
};

export function resolvePeriod(raw: unknown, now = new Date(), dayPart?: unknown): ResolvedPeriod {
  const value = String(raw ?? "today").trim().toLowerCase();
  let start: Date;
  let end: Date;
  let label = value;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    start = new Date(year, month - 1, day, 0, 0, 0, 0);
    end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
    label = value;
  } else if (/depois\s+de\s+amanh|day_after_tomorrow/.test(value)) {
    start = startOfLocalDay(addDays(now, 2)); end = startOfLocalDay(addDays(now, 3)); label = "depois de amanhã";
  } else if (/amanh|tomorrow/.test(value)) {
    start = startOfLocalDay(addDays(now, 1)); end = startOfLocalDay(addDays(now, 2)); label = "amanhã";
  } else if (/semana|this_week/.test(value)) {
    start = startOfLocalDay(now); end = startOfLocalDay(addDays(now, 7)); label = "próximos 7 dias";
  } else if (/pr[oó]ximos?\s*7|next_7/.test(value)) {
    start = startOfLocalDay(now); end = startOfLocalDay(addDays(now, 7)); label = "próximos 7 dias";
  } else {
    const weekday = Object.entries(weekdays).find(([name]) => value.includes(name))?.[1];
    if (weekday !== undefined) {
      const delta = (weekday - now.getDay() + 7) % 7 || 7;
      start = startOfLocalDay(addDays(now, delta)); end = startOfLocalDay(addDays(now, delta + 1)); label = value;
    } else {
      start = startOfLocalDay(now); end = startOfLocalDay(addDays(now, 1)); label = "hoje";
    }
  }

  const part = String(dayPart ?? "").toLowerCase();
  if (/manh|morning/.test(part)) { setLocalHour(start, 6); setLocalHour(end, 12); }
  else if (/tarde|afternoon/.test(part)) { setLocalHour(start, 12); setLocalHour(end, 18); }
  else if (/noite|evening|night/.test(part)) { setLocalHour(start, 18); setLocalHour(end, 23, 59, 59, 999); }

  return { start: start.toISOString(), end: end.toISOString(), label };
}

export function resolveDateTime(period: unknown, time: unknown, now = new Date()) {
  const range = resolvePeriod(period, now);
  const base = new Date(range.start);
  const text = String(time ?? "").trim().toLowerCase();
  const match = text.match(/(\d{1,2})(?::(\d{2}))?\s*(h|:)?/);
  if (!match) return undefined;
  const hours = Number(match[1]); const minutes = Number(match[2] ?? 0);
  if (hours > 23 || minutes > 59) return undefined;
  const local = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hours, minutes, 0, 0);
  return local.toISOString();
}

export function addMinutes(iso: string, minutes: number) { return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString(); }

function addDays(date: Date, days: number) { const copy = new Date(date); copy.setDate(copy.getDate() + days); return copy; }
function startOfLocalDay(date: Date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0); }
function setLocalHour(date: Date, hour: number, minute = 0, second = 0, ms = 0) { date.setHours(hour, minute, second, ms); }
