import {describe,expect,it} from "vitest";
import {deriveMissingFields,sanitizeDeclaredMissing} from "../../../packages/core/src/intent/operation-requirements.js";

describe("intent operation requirements",()=>{
  it("deriva missing pelo Core sem inventar entidade",()=>{
    expect(deriveMissingFields("create_folder",{name:{value:"teste",source:"user"}})).toEqual(["folder"]);
    expect(deriveMissingFields("write_text_file",{file:{value:"teste.txt",source:"user"}})).toEqual(["content"]);
  });
  it("descarta missing declarado fora dos requisitos da operação",()=>{
    expect(sanitizeDeclaredMissing("find_file",["name","folder","password"])).toEqual(["name"]);
  });
});
