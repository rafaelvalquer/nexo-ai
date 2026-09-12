import { z } from "zod";
import type { CalendarService } from "../../calendar/service.js";
import type { ToolDefinition } from "../types.js";
const eventSchema=z.object({connectionId:z.string().uuid(),title:z.string().min(1),start:z.string().datetime(),end:z.string().datetime(),timeZone:z.string().optional(),location:z.string().optional(),description:z.string().optional(),attendees:z.array(z.object({email:z.string().email(),name:z.string().optional()})).optional()});
export const calendarTools=(service:CalendarService):ToolDefinition[]=>[
  {name:"calendar_list",description:"Lista compromissos em um período",inputSchema:z.object({connectionId:z.string().uuid(),start:z.string().datetime(),end:z.string().datetime()}),risk:"READ",permissions:["calendar.read"],execute:async input=>{const data=await service.list(input.connectionId,input.start,input.end);return {ok:true,summary:`${data.length} compromisso(s) encontrado(s).`,data};}},
  {name:"calendar_create",description:"Cria um compromisso no calendário conectado",inputSchema:eventSchema,risk:"SENSITIVE",permissions:["calendar.write"],execute:async input=>({ok:true,summary:"Compromisso criado.",data:await service.create(input.connectionId,input)})}
];
