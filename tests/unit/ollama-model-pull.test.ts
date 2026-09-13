import { afterEach,describe,expect,it,vi } from "vitest";
import { OllamaProvider } from "../../packages/core/src/llm/ollama.js";

const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;vi.restoreAllMocks();});

describe("Ollama model download",()=>{
  it("consumes streamed progress and completes the requested model",async()=>{
    const progress:Array<{status:string;completed?:number;total?:number}>=[];
    globalThis.fetch=vi.fn(async(_input:URL|string,init?:RequestInit)=>{
      expect(JSON.parse(String(init?.body))).toMatchObject({model:"qwen3:1.7b",stream:true});
      return new Response([JSON.stringify({status:"pulling manifest"}),JSON.stringify({status:"downloading",completed:50,total:100}),JSON.stringify({status:"success",completed:100,total:100})].join("\n")+"\n",{status:200});
    }) as typeof fetch;
    const provider=new OllamaProvider("http://127.0.0.1:11434","qwen3:1.7b");
    await expect(provider.pullModel("qwen3:1.7b",event=>progress.push(event))).resolves.toEqual({ok:true,model:"qwen3:1.7b"});
    expect(progress).toHaveLength(3);
    expect(progress.at(-1)).toEqual({status:"success",completed:100,total:100});
  });

  it("surfaces an Ollama streaming error",async()=>{
    globalThis.fetch=vi.fn(async()=>new Response(`${JSON.stringify({error:"sem espaço"})}\n`,{status:200})) as typeof fetch;
    const provider=new OllamaProvider("http://127.0.0.1:11434","qwen3:1.7b");
    await expect(provider.pullModel("qwen3:1.7b")).rejects.toThrow("sem espaço");
  });
});
