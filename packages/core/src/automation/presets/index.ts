import type { AutomationPreset } from "@nexo/shared";
import { browserPresets } from "./browser.js";
import { calendarPresets } from "./calendar.js";
import { emailPresets } from "./email.js";
import { filesystemPresets } from "./filesystem.js";
import { productivityPresets } from "./productivity.js";
import { systemPresets } from "./system.js";

export const AUTOMATION_PRESETS: AutomationPreset[] = [
  ...productivityPresets,
  ...emailPresets,
  ...filesystemPresets,
  ...calendarPresets,
  ...systemPresets,
  ...browserPresets
];

export function getAutomationPreset(id: string): AutomationPreset | undefined { return AUTOMATION_PRESETS.find(preset => preset.id === id); }
