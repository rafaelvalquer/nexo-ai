import type { AgentTaskState, GoalDeliverable } from "../goal/goal-types.js";

export interface GoalToolBinding {
  toolName: string;
  fields: {
    path?: { source: "goal"; deliverableId: string; property: "resolvedPath" };
  };
}

const OUTPUT_PATH_FIELDS: Record<string, string> = {
  create_text_file: "path",
  create_folder: "path",
};

/**
 * Rebinds security-critical tool arguments to the destination already resolved
 * by the Core. Model-provided content stays model-controlled; the destination
 * does not.
 */
export class ToolArgumentResolver {
  resolve(toolName: string, input: Record<string, unknown>, taskState?: AgentTaskState) {
    const field = OUTPUT_PATH_FIELDS[toolName];
    if (!field || !taskState) return { ...input };
    const deliverable = selectDeliverable(taskState.goal.deliverables);
    if (!deliverable?.resolvedPath || deliverable.pathResolutionStatus !== "resolved") return { ...input };
    return { ...input, [field]: deliverable.resolvedPath };
  }

  binding(toolName: string, taskState?: AgentTaskState): GoalToolBinding | undefined {
    const field = OUTPUT_PATH_FIELDS[toolName];
    if (field !== "path" || !taskState) return undefined;
    const deliverable = selectDeliverable(taskState.goal.deliverables);
    if (!deliverable?.resolvedPath || deliverable.pathResolutionStatus !== "resolved") return undefined;
    return { toolName, fields: { path: { source: "goal", deliverableId: deliverable.id, property: "resolvedPath" } } };
  }
}

function selectDeliverable(deliverables: GoalDeliverable[]) {
  return deliverables.find(item => item.required && item.status !== "failed" && item.resolvedPath);
}
