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
  return value.trim().replace(/^(["'“”‘’])(.+)\1$/,"$2").replace(/[.?!]+$/u,match=>match.length===1?"":match).trim();
}
