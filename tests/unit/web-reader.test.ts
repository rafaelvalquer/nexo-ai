import { describe, expect, it } from "vitest";
import { extractWebDocument, isPublicAddress, parseSearchResults, webReaderTools } from "../../packages/core/src/tools/web";
import { ToolRegistry } from "../../packages/core/src/tools/registry";

describe("Web Reader",()=>{
  it("extracts the main page text and marks it as untrusted",async()=>{
    const tool=webReaderTools().find(item=>item.name==="web_extract")!;
    const result=await tool.execute({html:"<title>News &amp; updates</title><nav>Menu</nav><main><h1>Hello</h1><p>Useful <b>content</b>.</p><script>ignore()</script></main>",url:"https://example.com"}) as any;
    expect(result.data).toMatchObject({title:"News & updates",url:"https://example.com",untrustedExternalContent:true});
    expect(result.data.text).toContain("Useful content.");
    expect(result.data.text).not.toContain("ignore");
  });
  it("parses search result links and decodes snippets",()=>{
    const results=parseSearchResults('<a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fstory">A &amp; B</a><a class="result__snippet">A &quot;quote&quot;</a>',"https://html.duckduckgo.com/html/");
    expect(results).toEqual([{title:"A & B",url:"https://example.com/story",snippet:'A "quote"'}]);
  });
  it("allows public addresses and rejects local or reserved ranges",()=>{
    for(const address of ["8.8.8.8","1.1.1.1","2606:4700:4700::1111"])expect(isPublicAddress(address)).toBe(true);
    for(const address of ["127.0.0.1","10.0.0.1","169.254.169.254","192.0.2.1","::1","fc00::1","fe80::1","::ffff:127.0.0.1","2001::1","2002:0a00:0001::1"])expect(isPublicAddress(address)).toBe(false);
  });
  it("rejects private destinations before making a request",async()=>{
    const fetch=webReaderTools().find(item=>item.name==="web_fetch")!;
    await expect(fetch.execute({url:"http://127.0.0.1/"})).rejects.toThrow(/privado|reservado/i);
  });
  it("registers reader tools as read-only web tools with untrusted output",()=>{
    const registry=new ToolRegistry();
    for(const name of ["web_search","web_fetch","web_research","web_extract"]){
      expect(registry.get(name)).toMatchObject({risk:"READ",domain:"web",mutatesState:false,agent:{outputTrust:"untrusted_external"}});
    }
  });
});
