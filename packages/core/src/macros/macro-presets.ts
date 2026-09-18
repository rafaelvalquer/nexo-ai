import type { MacroPreset } from "@nexo/shared";
import { browserMacroPresets } from "./presets/browser.js";
import { calendarMacroPresets } from "./presets/calendar.js";
import { emailMacroPresets } from "./presets/email.js";
import { filesystemMacroPresets } from "./presets/filesystem.js";
import { productivityMacroPresets } from "./presets/productivity.js";
import { systemMacroPresets } from "./presets/system.js";

export const MACRO_PRESETS: MacroPreset[] = [
  ...productivityMacroPresets,
  ...emailMacroPresets,
  ...filesystemMacroPresets,
  ...calendarMacroPresets,
  ...systemMacroPresets,
  ...browserMacroPresets
];

export function getMacroPreset(id: string): MacroPreset | undefined { return MACRO_PRESETS.find(preset => preset.id === id); }
