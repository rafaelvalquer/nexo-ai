import type { MacroCondition, MacroConditionLogicalOperator, MacroExecutionContext } from "@nexo/shared";

export class MacroConditionEvaluator {
  evaluate(conditions: MacroCondition[], operator: MacroConditionLogicalOperator, context: MacroExecutionContext): boolean {
    if (!conditions.length) return true;
    const results = conditions.map(condition => this.evaluateOne(condition, context));
    return operator === "OR" ? results.some(Boolean) : results.every(Boolean);
  }

  private evaluateOne(condition: MacroCondition, context: MacroExecutionContext): boolean {
    const actual = resolveMacroField(condition.field, context);
    const expected = condition.value;
    switch (condition.operator) {
      case "equals": return normalize(actual) === normalize(expected);
      case "notEquals": return normalize(actual) !== normalize(expected);
      case "contains": return stringify(actual).includes(stringify(expected));
      case "notContains": return !stringify(actual).includes(stringify(expected));
      case "startsWith": return stringify(actual).startsWith(stringify(expected));
      case "endsWith": return stringify(actual).endsWith(stringify(expected));
      case "greaterThan": return Number(actual) > Number(expected);
      case "lessThan": return Number(actual) < Number(expected);
      case "exists": return expected === false ? actual === undefined || actual === null : actual !== undefined && actual !== null;
    }
  }
}

export function resolveMacroField(field: string, context: MacroExecutionContext): unknown {
  let normalized: string;
  if (!field.startsWith("$")) normalized = `trigger.data.${field}`;
  else {
    normalized = field.slice(1);
    if (normalized === "trigger") normalized = "trigger.data";
    else if (normalized.startsWith("trigger.") && !normalized.startsWith("trigger.data.")) normalized = `trigger.data.${normalized.slice("trigger.".length)}`;
    else if (normalized === "actions") normalized = "actionResults";
    else if (normalized.startsWith("actions.")) normalized = `actionResults.${normalized.slice("actions.".length)}`;
  }
  const parts = normalized.split(".").filter(Boolean);
  let current: unknown = context;
  for (const part of parts) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function normalize(value: unknown): string | number | boolean | null | undefined {
  if (typeof value === "string") return value.trim().toLocaleLowerCase("pt-BR");
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) return value;
  return JSON.stringify(value);
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  return (typeof value === "string" ? value : JSON.stringify(value)).toLocaleLowerCase("pt-BR");
}
