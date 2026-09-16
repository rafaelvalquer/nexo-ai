const BROWSER_AGENT_MODEL_ENV = "NEXO_BROWSER_AGENT_MODEL";

export type BrowserAgentModelSource = "explicit" | `environment:${typeof BROWSER_AGENT_MODEL_ENV}` | "global_setting";
export type ResolvedBrowserAgentModel = { model:string; source:BrowserAgentModelSource };

/**
 * Lets Browser Agent use a dedicated local model without changing the model used
 * by the rest of Nexo. An explicit override wins over the process environment;
 * otherwise the existing configured model remains the fallback.
 */
export function resolveBrowserAgentModel(
  defaultModel:string,
  explicitModel?:string,
  env:NodeJS.ProcessEnv = process.env
):ResolvedBrowserAgentModel {
  const explicit = explicitModel?.trim();
  if (explicit) return validated(explicit,"explicit");
  const environmentModel = env[BROWSER_AGENT_MODEL_ENV]?.trim();
  if (environmentModel) return validated(environmentModel,`environment:${BROWSER_AGENT_MODEL_ENV}`);
  return validated(defaultModel.trim(),"global_setting");
}

function validated(model:string,source:BrowserAgentModelSource):ResolvedBrowserAgentModel {
  if (!model || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(model)) {
    throw Object.assign(new Error(`Modelo do Browser Agent inválido na origem ${source}. Informe um nome de modelo Ollama válido.`),{code:"BROWSER_MODEL_CONFIG_INVALID",model,source});
  }
  return {model,source};
}

export { BROWSER_AGENT_MODEL_ENV };
