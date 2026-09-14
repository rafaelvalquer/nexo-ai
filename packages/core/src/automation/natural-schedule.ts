const days: Record<string, number> = { domingo:0, segunda:1, "segunda-feira":1, terca:2, "terca-feira":2, quarta:3, "quarta-feira":3, quinta:4, "quinta-feira":4, sexta:5, "sexta-feira":5, sabado:6 };

/** Parses the predictable natural-language schedules exposed by Automation Center. */
export function parseNaturalSchedule(value: string): string {
  const normalized = stripAccents(value.trim().toLowerCase());
  const minutesInterval = normalized.match(/a cada\s+(\d+)\s+minutos?/);
  if (minutesInterval) {
    const minutes = Number(minutesInterval[1]);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 59) throw new Error("O intervalo em minutos deve ficar entre 1 e 59.");
    return `*/${minutes} * * * *`;
  }
  if (/a cada hora|de hora em hora/.test(normalized)) return "0 * * * *";

  const time = normalized.match(/(?:as)\s*(\d{1,2}):(\d{2})/);
  if (!time) throw new Error("Informe o horário, por exemplo: todos os dias às 08:00.");
  const hour = Number(time[1]), minute = Number(time[2]);
  if (hour > 23 || minute > 59) throw new Error("Horário inválido.");

  const monthly = normalized.match(/todo\s+dia\s+(\d{1,2})\b/);
  if (monthly) {
    const day = Number(monthly[1]);
    if (day < 1 || day > 31) throw new Error("Dia do mês inválido.");
    return `${minute} ${hour} ${day} * *`;
  }
  if (/dias? uteis/.test(normalized)) return `${minute} ${hour} * * 1-5`;
  if (/fim de semana|fins de semana/.test(normalized)) return `${minute} ${hour} * * 0,6`;

  const foundDays = [...new Set(Object.entries(days).filter(([name]) => new RegExp(`\\b${escapeRegExp(name)}\\b`).test(normalized)).map(([, day]) => day))].sort();
  if (foundDays.length) return `${minute} ${hour} * * ${foundDays.join(",")}`;
  if (/todos os dias|todo dia|diariamente|a cada dia/.test(normalized)) return `${minute} ${hour} * * *`;
  throw new Error("Use um intervalo, 'todos os dias', 'dias úteis', 'fim de semana', dias da semana ou 'todo dia N', com horário quando necessário.");
}

function stripAccents(value: string): string { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
