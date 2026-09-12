import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ComponentPropsWithoutRef } from "react";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

function CodeBlock({ className, children, ...props }: ComponentPropsWithoutRef<"code">) {
  const [copied,setCopied]=useState(false); const language=/language-(\w+)/.exec(className??"")?.[1]; const value=String(children).replace(/\n$/,"");
  if(!language)return <code className={className} {...props}>{children}</code>;
  return <div className="codeBlock"><header><span>{language}</span><button type="button" onClick={async()=>{await navigator.clipboard.writeText(value);setCopied(true);window.setTimeout(()=>setCopied(false),1400);}}>{copied?<Check size={13}/>:<Copy size={13}/>} {copied?"Copiado":"Copiar"}</button></header><pre><code className={className} {...props}>{children}</code></pre></div>;
}
export function MarkdownContent({content}:{content:string}){return <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{code:CodeBlock,a:({href,children})=><a href={href} onClick={event=>{event.preventDefault();if(href)void window.nexo.openExternal(href);}}>{children}</a>}}>{content}</ReactMarkdown></div>;}
