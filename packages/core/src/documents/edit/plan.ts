import { z } from "zod";

const locator = z.object({ paragraph: z.number().int().nonnegative() });
export const docxEditOperationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("replace_text"), find: z.string().min(1), replace: z.string(), occurrence: z.number().int().positive().optional() }),
  z.object({ type: z.literal("replace_paragraph"), locator, text: z.string() }),
  z.object({ type: z.literal("insert_after"), locator, text: z.string(), style: z.string().optional() }),
  z.object({ type: z.literal("insert_before"), locator, text: z.string(), style: z.string().optional() }),
  z.object({ type: z.literal("delete_paragraph"), locator }),
  z.object({ type: z.literal("set_table_cell"), table: z.number().int().nonnegative(), row: z.number().int().nonnegative(), column: z.number().int().nonnegative(), text: z.string() }),
  z.object({ type: z.literal("fill_content_control"), tag: z.string().min(1), text: z.string() })
]);
export const docxEditPlanSchema = z.object({ documentId: z.string().uuid(), operations: z.array(docxEditOperationSchema).min(1).max(100), rationale: z.string().min(1).max(2000) });
export type DocxEditPlan = z.infer<typeof docxEditPlanSchema>;
