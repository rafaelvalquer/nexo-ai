export type GoalEffect="resource_created"|"resource_updated"|"resource_deleted"|"information_returned"|"message_sent"|"event_changed"|"navigation"|"interaction"|"unknown";
export type GoalContract={effect:GoalEffect;requiredOutput:string[];minimumItems?:number};
export const goalContracts:Record<string,GoalContract>={
 create_folder:{effect:"resource_created",requiredOutput:["path|createdPath"]},
 create_text_file:{effect:"resource_created",requiredOutput:["path|createdPath"]},
 write_text_file:{effect:"resource_updated",requiredOutput:["path"]},
 copy_file:{effect:"resource_created",requiredOutput:["path|destination"]},
 move_file:{effect:"resource_updated",requiredOutput:["path|destination"]},
 rename_file:{effect:"resource_updated",requiredOutput:["path|newPath"]},
 trash_file:{effect:"resource_deleted",requiredOutput:[]},
 find_file:{effect:"information_returned",requiredOutput:["matches"]},
 list_files:{effect:"information_returned",requiredOutput:["items|entries|files"]},
 search_files:{effect:"information_returned",requiredOutput:["matches|items|files"]},
 read_file:{effect:"information_returned",requiredOutput:["text|content"]},
 web_research:{effect:"information_returned",requiredOutput:["articles|headlines"],minimumItems:1},
 web_search:{effect:"information_returned",requiredOutput:["results"],minimumItems:1},
 web_fetch:{effect:"information_returned",requiredOutput:["text"]},
 browser_open:{effect:"navigation",requiredOutput:[]},
 browser_agent_run:{effect:"interaction",requiredOutput:[]},
 email_send:{effect:"message_sent",requiredOutput:["messageId|id"]},
 email_send_composed:{effect:"message_sent",requiredOutput:["messageId|id"]},
 email_reply:{effect:"message_sent",requiredOutput:["messageId|id"]},
 calendar_create:{effect:"event_changed",requiredOutput:["eventId|id"]},
 calendar_create_meeting:{effect:"event_changed",requiredOutput:["eventId|id"]},
 document_create:{effect:"resource_created",requiredOutput:["documentId|id|path"]},
 document_summarize:{effect:"information_returned",requiredOutput:["summary|text|content"]}
};
