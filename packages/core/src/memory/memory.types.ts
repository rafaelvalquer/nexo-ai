export type MemoryCategory =
  | "profile"
  | "preference"
  | "project"
  | "location"
  | "application"
  | "workflow"
  | "other";

export interface Memory {
  id: string;
  key: string;
  value: string;
  category: MemoryCategory;
  source: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}
