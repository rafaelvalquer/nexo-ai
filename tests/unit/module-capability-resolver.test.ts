import {describe,expect,it} from "vitest";
import {ModuleCapabilityResolver} from "../../packages/core/src/modules/module-capability-resolver.js";

describe("ModuleCapabilityResolver",()=>{
  const resolver=new ModuleCapabilityResolver();
  it("não carrega Documents apenas por filesystem",()=>{
    expect(resolver.forResources({attachmentIds:[],resolvedDocumentIds:[]})).toEqual([]);
    expect(resolver.forTool("find_file")).toEqual([]);
  });
  it("ativa Documents somente por recurso/capability real",()=>{
    expect(resolver.forResources({attachmentIds:["doc-1"],resolvedDocumentIds:[]})).toEqual(["documents"]);
    expect(resolver.forTool("document_summarize")).toEqual(["documents"]);
    expect(resolver.forTool("document_search")).toEqual(["documents","rag"]);
  });
});
