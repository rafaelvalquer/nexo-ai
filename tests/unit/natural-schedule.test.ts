import { describe, expect, it } from "vitest";
import { parseNaturalSchedule } from "../../packages/core/src/automation/natural-schedule.js";

describe("natural automation schedules", () => {
  it.each([
    ["Todos os dias às 08:00", "0 8 * * *"],
    ["Dias úteis às 09:30", "30 9 * * 1-5"],
    ["Sexta às 16:00", "0 16 * * 5"]
  ])("parses %s", (natural, cron) => expect(parseNaturalSchedule(natural)).toBe(cron));
  it("rejects ambiguous schedules", () => expect(() => parseNaturalSchedule("quando eu quiser")).toThrow(/horário/));
});
