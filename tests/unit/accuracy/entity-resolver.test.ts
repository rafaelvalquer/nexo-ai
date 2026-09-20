import {describe,expect,it} from "vitest";
import {EntityResolverV2} from "../../../packages/core/src/intent/entities/resolver.js";
describe("EntityResolverV2",()=>{
 it("explicit text overrides stale context",()=>{const result=new EntityResolverV2().resolve({operation:"create_folder",text:"crie pasta teste em Documents",llmEntities:{name:"teste"},contextEntities:{folder:{value:"Downloads",source:"entity_ledger",confidence:.8}},currentTurnEntities:{name:"teste"}});expect(result.entities.folder?.value).toBe("Documents");});
 it("memory cannot invent a destructive physical target",()=>{const result=new EntityResolverV2().resolve({operation:"trash_file",text:"apague ele",memoryEntities:{path:"C:/Secret/file.txt"}});expect(result.entities.path).toBeUndefined();expect(result.rejected).toContain("path");});
});
