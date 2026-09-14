const EMAIL_PATTERN=/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g;

export function extractEmailAddresses(text:string):string[]{
  const matches=text.match(EMAIL_PATTERN)??[];
  return[...new Set(matches.map(email=>email.toLowerCase()))];
}

export function extractSimpleEmailBody(text:string):string|undefined{
  const patterns=[
    /\bdando\s+(?:apenas\s+)?(?:(?:um|uma)\s+)?(.+)$/i,
    /\bfalando\s+(.+)$/i,
    /\bcom\s+(?:a\s+)?mensagem\s+(.+)$/i,
    /\bcom\s+(?:o\s+)?texto\s+(.+)$/i
  ];
  for(const pattern of patterns){
    const match=text.match(pattern);if(!match?.[1])continue;
    const body=cleanExplicitBody(match[1]);
    if(body&&body.length<=500&&!/[\r\n]/.test(body))return body;
  }
  return undefined;
}

function cleanExplicitBody(value:string){
  const raw=value.trim();
  const quotePairs:Array<[string,string]>=[["\"","\""],["'","'"],["“","”"],["‘","’"]];
  for(const[open,close]of quotePairs){
    if(raw.length>open.length+close.length&&raw.startsWith(open)&&raw.endsWith(close))return raw.slice(open.length,raw.length-close.length).trim();
  }
  return raw;
}
