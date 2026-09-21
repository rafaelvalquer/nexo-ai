import path from "node:path";
import {randomUUID} from "node:crypto";
import type {ToolRegistry} from "../../tools/registry.js";
import type {CanonicalActionPlan} from "./canonical-action-plan.js";

export type FilesystemCanonicalRequest={
  operation:string;
  entities:Record<string,unknown>;
  candidateId?:string;
  decisionSource:CanonicalActionPlan["source"]["decisionSource"];
};

export class FilesystemActionPlanner{
  constructor(private readonly registry:ToolRegistry){}
  plan(request:FilesystemCanonicalRequest):CanonicalActionPlan|undefined{
    const entities=request.entities;
    const source={candidateId:request.candidateId??randomUUID(),decisionSource:request.decisionSource};
    const base={id:randomUUID(),domain:"filesystem" as const,operation:request.operation,entities:{...entities},source};
    if(request.operation==="write_text_file"){
      const content=stringValue(entities.content);
      if(content===undefined)return undefined;
      const explicit=stringValue(entities.path);
      if(explicit&&isAbsolutePortable(explicit)&&this.registry.get("write_text_file")){
        return{...base,steps:[{tool:"write_text_file",input:{path:explicit,content},explanation:"Preparando a alteração do arquivo…"}],requiresApproval:true,expectedEffect:"file_content_replaced"};
      }
      const fileName=stringValue(entities.file??entities.name);
      if(!fileName||!this.registry.get("find_file")||!this.registry.get("write_text_file"))return undefined;
      const root=stringValue(entities.root);
      return{...base,steps:[{tool:"find_file",input:{name:fileName,matchMode:path.extname(fileName)?"full_name":"stem",...(root?{root}:{})},explanation:`Localizando ${fileName} antes da alteração…`}],deferredAction:{kind:"filesystem.write_text",fileName,content,...(root?{root}:{})},requiresApproval:true,expectedEffect:"file_content_replaced"};
    }
    if(request.operation==="open_file"||request.operation==="open_path"){
      const explicit=stringValue(entities.path);
      if(explicit&&isAbsolutePortable(explicit)&&this.registry.get("open_path"))return{...base,steps:[{tool:"open_path",input:{path:explicit},explanation:`Abrindo ${path.basename(explicit)}…`}],requiresApproval:false,expectedEffect:"file_opened"};
      const fileName=stringValue(entities.file??entities.name);
      if(!fileName||!this.registry.get("find_file")||!this.registry.get("open_path"))return undefined;
      const root=stringValue(entities.root);
      return{...base,steps:[{tool:"find_file",input:{name:fileName,matchMode:path.extname(fileName)?"full_name":"stem",...(root?{root}:{})},explanation:`Localizando ${fileName} antes de abrir…`}],deferredAction:{kind:"filesystem.open",fileName,...(root?{root}:{})},requiresApproval:false,expectedEffect:"file_opened"};
    }
    const tool=request.operation;
    const definition=this.registry.get(tool);
    if(!definition)return undefined;
    return{...base,steps:[{tool,input:{...entities}}],requiresApproval:Boolean(definition.mutatesState),expectedEffect:tool};
  }
}
function stringValue(value:unknown){return typeof value==="string"&&value.trim()?value.trim():value===""?"":undefined;}
function isAbsolutePortable(value:string){return path.isAbsolute(value)||path.win32.isAbsolute(value);}
