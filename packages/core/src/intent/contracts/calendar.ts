import {contract} from "./types.js";
export const calendarIntentContracts={
 calendar_list:contract("calendar","list",[],["start","end","connectionId"]),
 calendar_search:contract("calendar","find",["query"],["start","end","connectionId"]),
 calendar_get:contract("calendar","read",["eventId"],["connectionId"]),
 calendar_find_free_time:contract("calendar","find",["start","end","durationMinutes"],["connectionId"]),
 calendar_create:contract("calendar","create",["title","start"],["end","attendees","location","description","connectionId"]),
 calendar_create_agent:contract("calendar","create",["title","start"],["end","attendees","location","description","connectionId"]),
 calendar_update:contract("calendar","update",["eventId"],["title","start","end","attendees","location","description","connectionId"]),
 calendar_delete:contract("calendar","delete",["eventId"],["connectionId"]),
 calendar_rsvp:contract("calendar","update",["eventId","response"],["connectionId"])
} as const;
