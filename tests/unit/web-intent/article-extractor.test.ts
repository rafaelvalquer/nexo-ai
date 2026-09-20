import {describe,expect,it} from "vitest";
import {extractArticleCandidates} from "../../../packages/core/src/web/article-extractor.js";

describe("extractArticleCandidates",()=>{
  it("accepts article links on subdomains of the requested news source",()=>{
    const html='<a href="https://g1.globo.com/economia/noticia/2026/09/20/mercado-hoje.ghtml">Mercado hoje tem novos movimentos relevantes</a>';
    const result=extractArticleCandidates(html,"https://www.globo.com/");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({url:"https://g1.globo.com/economia/noticia/2026/09/20/mercado-hoje.ghtml"});
  });

  it("does not accept links outside the source site",()=>{
    const html='<a href="https://example.org/noticias/copia">Uma manchete externa com tamanho suficiente</a>';
    expect(extractArticleCandidates(html,"https://www.globo.com/")).toHaveLength(0);
  });
});
