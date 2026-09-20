import {describe,expect,it} from "vitest";
import {IntentMemorySanitizer} from "../../../packages/core/src/agent/intent-memory/sanitizer.js";
describe("IntentMemorySanitizer",()=>{it("removes direct sensitive values",()=>{const value=new IntentMemorySanitizer().sanitize("envie para joao@email.com usando C:\\Users\\Rafael\\segredo.txt e https://exemplo.com/x");expect(value).toContain("<EMAIL>");expect(value).toContain("<PATH>");expect(value).toContain("<URL>");expect(value).not.toContain("joao@email.com");});});
