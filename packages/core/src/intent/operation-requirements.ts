import { intentOperationContracts } from "./operation-contracts.js";
import type { CanonicalIntent } from "./types.js";

export const intentOperationRequirements = Object.fromEntries(
  Object.entries(intentOperationContracts).map(([op, contract]) => [
    op,
    { required: contract.requiredEntities, optional: contract.optionalEntities }
  ])
) as Record<string, { required: readonly string[]; optional: readonly string[] }>;

export function hasIntentEntity(intent: CanonicalIntent, key: string) {
  const value = intent.entities[key]?.value;
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function deriveMissingFields(operation: string, entities: CanonicalIntent["entities"]): string[] {
  const contract = intentOperationContracts[operation];
  if (!contract) return [];
  const intent = { entities } as CanonicalIntent;
  return contract.requiredEntities.filter(key => !hasIntentEntity(intent, key));
}

export function sanitizeDeclaredMissing(operation: string, missing: string[]) {
  const contract = intentOperationContracts[operation];
  if (!contract) return [];
  const allowed = new Set<string>(contract.requiredEntities);
  return missing.filter(key => allowed.has(key));
}
