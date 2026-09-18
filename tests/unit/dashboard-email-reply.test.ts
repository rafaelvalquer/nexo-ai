import {afterEach,describe,expect,it,vi} from "vitest";
import {EmailService} from "../../packages/core/src/email/service.js";

const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;vi.restoreAllMocks();});
describe("Dashboard email replies",()=>{
  it("sends Gmail replies inside the original thread with reply headers",async()=>{
    const requests:Request[]=[];globalThis.fetch=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{const request=new Request(input,init);requests.push(request);if(request.url.includes("format=metadata"))return Response.json({threadId:"thread-1",payload:{headers:[{name:"From",value:"Rita <rita@example.com>\r\nBcc: attacker@example.com"},{name:"Subject",value:"Atualização\r\nBcc: attacker@example.com"},{name:"Message-ID",value:"<msg-1@example.com>"},{name:"References",value:"<older@example.com>"}]}});return Response.json({id:"sent-1"});}) as any;
    const service=new EmailService({get:()=>({id:"c1",provider:"google"}),accessToken:async()=>"token"} as any);
    await expect(service.reply({connectionId:"c1",messageId:"m1",threadId:"thread-1",bodyText:"Obrigado pela atualização."})).resolves.toMatchObject({sent:true,threadId:"thread-1"});
    const sent=JSON.parse(await requests[1].text()),mime=Buffer.from(sent.raw,"base64url").toString("utf8");
    expect(sent.threadId).toBe("thread-1");expect(mime).toContain("In-Reply-To: <msg-1@example.com>");expect(mime).toContain("References: <older@example.com> <msg-1@example.com>");expect(mime).toContain("To: rita@example.com");expect(mime).not.toContain("Bcc:");expect(mime).toContain("Obrigado pela atualização.");
  });
  it("creates, updates, then sends a Microsoft reply draft",async()=>{
    const calls:string[]=[];globalThis.fetch=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{const url=String(input);calls.push(`${init?.method??"GET"} ${url}`);if(url.endsWith("/createReply"))return Response.json({id:"draft-1"});if(init?.method==="POST")return new Response(null,{status:202});return new Response(null,{status:200});}) as any;
    const service=new EmailService({get:()=>({id:"c2",provider:"microsoft"}),accessToken:async()=>"token"} as any);
    await expect(service.reply({connectionId:"c2",messageId:"message-2",threadId:"conversation-2",bodyText:"Confirmado."})).resolves.toMatchObject({sent:true,threadId:"conversation-2"});
    expect(calls.map(call=>call.split(" ")[0])).toEqual(["POST","PATCH","POST"]);expect(calls[0]).toContain("/messages/message-2/createReply");expect(calls[1]).toContain("/messages/draft-1");expect(calls[2]).toContain("/messages/draft-1/send");
  });
});
