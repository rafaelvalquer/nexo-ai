const BROWSER_AGENT_MODEL_ENV = "NEXO_BROWSER_AGENT_MODEL";

/**
 * Lets Browser Agent use a dedicated local model without changing the model used
 * by the rest of Nexo. An explicit override wins over the process environment;
 * otherwise the existing configured model remains the fallback.
 */
export function resolveBrowserAgentModel(
  defaultModel:string,
  explicitModel?:string,
  env:NodeJS.ProcessEnv = process.env
) {
  const explicit = explicitModel?.trim();
  if (explicit) return explicit;
  const environmentModel = env[BROWSER_AGENT_MODEL_ENV]?.trim();
  if (environmentModel) return environmentModel;
  return defaultModel.trim();
}

export { BROWSER_AGENT_MODEL_ENV };
