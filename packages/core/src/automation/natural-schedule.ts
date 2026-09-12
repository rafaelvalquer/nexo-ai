const days: Record<string, number> = { domingo:0, segunda:1, "segunda-feira":1, terca:2, "terça-feira":2, quarta:3, "quarta-feira":3, quinta:4, "quinta-feira":4, sexta:5, "sexta-feira":5, sabado:6, "sábado":6 };

/** Parses the intentionally small, predictable language exposed in the UI. */
export function parseNaturalSchedule(value: string) {
  const normalized = value.trim().toLowerCase();
  const time = normalized.match(/(?:às|as)\s*(\d{1,2}):(\d{2})/);
  if (!time) throw new Error("Informe o horário, por exemplo: todos os dias às 08:00.");
  const hour = Number(time[1]), minute = Number(time[2]);
  if (hour > 23 || minute > 59) throw new Error("Horário inválido.");
  if (/dias? úteis|dias? uteis/.test(normalized)) return `${minute} ${hour} * * 1-5`;
  const foundDay = Object.entries(days).find(([name]) => new RegExp(`\\b${name}\\b`).test(normalized));
  if (foundDay) return `${minute} ${hour} * * ${foundDay[1]}`;
  if (/todos os dias|diariamente|a cada dia/.test(normalized)) return `${minute} ${hour} * * *`;
  throw new Error("Use 'todos os dias', 'dias úteis' ou um dia da semana, seguido de 'às HH:MM'.");
}
