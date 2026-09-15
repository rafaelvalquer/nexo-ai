import type { NexoSettings } from "@nexo/shared";

export const CURRENT_SETTINGS_SCHEMA_VERSION = 1;
export interface SettingsMigration { version: number; migrate(settings: NexoSettings): NexoSettings; }

const migrations: SettingsMigration[] = [{
  version: 1,
  migrate(settings) {
    const historicalLegacy = settings.agentLoopMode === "legacy" && settings.agentLoopModeExplicitlySelected !== true;
    return { ...settings,
      agentLoopMode: historicalLegacy || !settings.agentLoopMode ? "full" : settings.agentLoopMode,
      agentLoopModeExplicitlySelected: settings.agentLoopModeExplicitlySelected === true,
      agentLegacyFallbackEnabled: settings.agentLegacyFallbackEnabled === true,
      developerDiagnosticsEnabled: settings.developerDiagnosticsEnabled === true,
      settingsSchemaVersion: 1 };
  }
}];

export function migrateSettings(saved: Partial<NexoSettings>, defaults: NexoSettings): NexoSettings {
  let settings: NexoSettings = { ...defaults, ...saved, oauth: { ...defaults.oauth, ...(saved.oauth ?? {}) } };
  const sourceVersion = Number.isInteger(saved.settingsSchemaVersion) ? Number(saved.settingsSchemaVersion) : 0;
  for (const migration of migrations) if (migration.version > sourceVersion) settings = migration.migrate(settings);
  settings.settingsSchemaVersion = CURRENT_SETTINGS_SCHEMA_VERSION;
  return settings;
}
