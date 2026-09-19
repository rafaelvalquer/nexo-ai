export type CoreModuleCapability="documents"|"rag";

export class ModuleCapabilityResolver{
  forResources(input:{attachmentIds?:string[];resolvedDocumentIds?:string[]}):CoreModuleCapability[]{
    if((input.attachmentIds?.length??0)>0||(input.resolvedDocumentIds?.length??0)>0)return["documents"];
    return[];
  }

  forTool(toolName:string):CoreModuleCapability[]{
    if(toolName==="document_search"||toolName==="document_ask")return["documents","rag"];
    if(toolName.startsWith("document_"))return["documents"];
    return[];
  }
}
