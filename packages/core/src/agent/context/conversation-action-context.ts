import type { ToolResult } from "@nexo/shared";
import type { AgentIntent } from "../orchestrator/intent-schema.js";
import type { PlanStep } from "../planner.js";

export type ActionContextEmail = {
  id: string;
  from?: string;
  subject?: string;
  receivedAt?: string;
  snippet?: string;
};

export type ActionContextCalendar = {
  id: string;
  title?: string;
  start?: string;
  end?: string;
};
export type ActionContextFile = { name:string; path:string; root?:string; size?:number; modifiedAt?:string };
export type ActionContextPage = { id:string; url:string; title?:string; snippet?:string; fullyRead?:boolean };

export type ConversationActionContextState = {
  updatedAt: string;
  lastDomain?: AgentIntent["domain"];
  lastIntent?: AgentIntent["intent"];
  lastTool?: string;
  lastQuery?: string;
  emails?: ActionContextEmail[];
  events?: ActionContextCalendar[];
  files?: ActionContextFile[];
  pages?: ActionContextPage[];
  emailConnectionId?: string;
  calendarConnectionId?: string;
};

const LIVE_EMAIL_SNAPSHOT_TOOLS = new Set(["email_search", "email_latest"]);
const LIVE_CALENDAR_SNAPSHOT_TOOLS = new Set(["calendar_list", "calendar_search"]);

export function observeConversationActionContext(
  previous: ConversationActionContextState | undefined,
  userRequest: string,
  intent: AgentIntent | undefined,
  step: PlanStep,
  result: ToolResult
): ConversationActionContextState {
  const next: ConversationActionContextState = {
    ...(previous ?? { updatedAt: new Date().toISOString() }),
    updatedAt: new Date().toISOString(),
    lastDomain: intent?.domain ?? previous?.lastDomain,
    lastIntent: intent?.intent ?? previous?.lastIntent,
    lastTool: step.tool,
    lastQuery: userRequest
  };

  if (!result.ok) return next;

  if (step.tool === "find_file") {
    const data=result.data as any;
    const matches=Array.isArray(data?.matches)?data.matches:[];
    next.lastDomain="filesystem";
    next.files=matches.filter((item:any)=>typeof item?.name==="string"&&typeof item?.path==="string").slice(0,50).map((item:any)=>({name:String(item.name),path:String(item.path),...(typeof item.root==="string"?{root:item.root}:{}),...(typeof item.size==="number"?{size:item.size}:{}),...(typeof item.modifiedAt==="string"?{modifiedAt:item.modifiedAt}:{})}));
  }

  if (step.tool === "web_research") {
    const data=result.data as any;
    const candidates=[...(Array.isArray(data?.headlines)?data.headlines:[]),...(Array.isArray(data?.articles)?data.articles:[])];
    const seen=new Set<string>();
    next.pages=candidates.filter((item:any)=>typeof item?.url==="string"&&!seen.has(item.url)&&seen.add(item.url)).slice(0,50).map((item:any)=>({id:String(item.url),url:String(item.url),title:typeof item.title==="string"?item.title:undefined,snippet:typeof item.snippet==="string"?item.snippet.slice(0,600):undefined,fullyRead:item.fullyRead===true||Boolean(item.text)}));
  }

  // Any mailbox mutation makes the previous selection unsafe to reuse. A later
  // explicit follow-up must start from a new live search rather than stale IDs.
  if (isEmailMutationTool(step.tool)) delete next.emails;

  if (step.tool.startsWith("email_") && !isEmailMutationTool(step.tool)) {
    const data = result.data as any;
    const messages = Array.isArray(data?.messages) ? data.messages : Array.isArray(data) ? data : data?.id ? [data] : [];
    const normalized = messages
      .filter((item: any) => item?.id)
      .slice(0, 50)
      .map((item: any) => ({
        id: String(item.id),
        from: String(item.from?.email ?? item.from?.name ?? "") || undefined,
        subject: typeof item.subject === "string" ? item.subject : undefined,
        receivedAt: typeof item.receivedAt === "string" ? item.receivedAt : undefined,
        snippet: typeof item.snippet === "string" ? item.snippet.slice(0, 600) : undefined
      }));

    // Live list/search tools are authoritative snapshots. An empty result must
    // clear the previous snapshot instead of leaving old Gmail IDs in context.
    if (LIVE_EMAIL_SNAPSHOT_TOOLS.has(step.tool)) next.emails = normalized;
    else if (normalized.length) next.emails = normalized;
    if(LIVE_EMAIL_SNAPSHOT_TOOLS.has(step.tool)||normalized.length)next.emailConnectionId=typeof step.input.connectionId === "string"?step.input.connectionId:undefined;
  }

  if (isCalendarMutationTool(step.tool)) delete next.events;

  if (step.tool.startsWith("calendar_") && !isCalendarMutationTool(step.tool)) {
    const data = result.data as any;
    const events = Array.isArray(data) ? data : data?.id ? [data] : [];
    const normalized = events
      .filter((item: any) => item?.id)
      .slice(0, 50)
      .map((item: any) => ({
        id: String(item.id),
        title: typeof item.title === "string" ? item.title : undefined,
        start: typeof item.start === "string" ? item.start : undefined,
        end: typeof item.end === "string" ? item.end : undefined
      }));

    if (LIVE_CALENDAR_SNAPSHOT_TOOLS.has(step.tool)) next.events = normalized;
    else if (normalized.length) next.events = normalized;
    if(LIVE_CALENDAR_SNAPSHOT_TOOLS.has(step.tool)||normalized.length)next.calendarConnectionId=typeof step.input.connectionId === "string"?step.input.connectionId:undefined;
  }

  return next;
}

export function selectedPreviousEmailIds(state: ConversationActionContextState | undefined, selection?: AgentIntent["reference"]) {
  const rows = state?.emails ?? [];
  if (!selection?.selection || selection.selection.type === "all") return rows.map(row => row.id);
  if (selection.selection.type === "first") return rows.slice(0, selection.selection.count ?? 1).map(row => row.id);
  const indices = new Set(selection.selection.indices ?? []);
  return rows.filter((_row, index) => indices.has(index + 1)).map(row => row.id);
}

export function selectedPreviousEventIds(state: ConversationActionContextState | undefined, selection?: AgentIntent["reference"]) {
  const rows = state?.events ?? [];
  if (!selection?.selection || selection.selection.type === "all") return rows.map(row => row.id);
  if (selection.selection.type === "first") return rows.slice(0, selection.selection.count ?? 1).map(row => row.id);
  const indices = new Set(selection.selection.indices ?? []);
  return rows.filter((_row, index) => indices.has(index + 1)).map(row => row.id);
}

function isEmailMutationTool(toolName: string) {
  return /^email_(?:send(?:_composed)?|mark_(?:un)?read|archive|flag|trash|move|add_label|remove_label|bulk_(?:trash|archive|mark_read|mark_unread))$/.test(toolName);
}

function isCalendarMutationTool(toolName: string) {
  return /^calendar_(?:create|create_meeting|update|delete|rsvp)$/.test(toolName);
}
