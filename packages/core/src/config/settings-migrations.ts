import type { NexoSettings } from "@nexo/shared";

export const CURRENT_SETTINGS_SCHEMA_VERSION = 5;
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
}, {
  version: 2,
  migrate(settings) {
    return { ...settings,
      // The simpler deterministic router is the default; retain advanced mode only
      // when a user explicitly selected it in a previous release.
      agentLoopMode: settings.agentLoopModeExplicitlySelected === true ? settings.agentLoopMode : "legacy",
      settingsSchemaVersion: 2 };
  }
}, {
  version: 3,
  migrate(settings) { return { ...settings, documentsEnabled: settings.documentsEnabled ?? true, semanticSearchEnabled: settings.semanticSearchEnabled ?? true, settingsSchemaVersion: 3 }; }
}, {
  version: 4,
  migrate(settings) {
    return { ...settings,
      hybridIntentResolverEnabled: settings.hybridIntentResolverEnabled ?? true,
      hybridIntentShadowMode: settings.hybridIntentShadowMode ?? false,
      hybridIntentFilesystemEnabled: settings.hybridIntentFilesystemEnabled ?? true,
      settingsSchemaVersion: 4 };
  }
}, {
  version: 5,
  migrate(settings) {
    return { ...settings,
      hybridIntentRoutingV2Enabled: settings.hybridIntentRoutingV2Enabled ?? true,
      settingsSchemaVersion: 5 };
  }
}];

export function migrateSettings(saved: Partial<NexoSettings>, defaults: NexoSettings): NexoSettings {
  let settings: NexoSettings = { ...defaults, ...saved, oauth: { ...defaults.oauth, ...(saved.oauth ?? {}) } };
  const sourceVersion = Number.isInteger(saved.settingsSchemaVersion) ? Number(saved.settingsSchemaVersion) : 0;
  for (const migration of migrations) if (migration.version > sourceVersion) settings = migration.migrate(settings);
  settings.settingsSchemaVersion = CURRENT_SETTINGS_SCHEMA_VERSION;
  return settings;
}
