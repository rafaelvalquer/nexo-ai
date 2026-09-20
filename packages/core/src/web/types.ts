export type WebSearchResult={title:string;url:string;snippet:string};
export type WebDocument={url:string;title:string;text:string};
export type WebHtmlDocument={url:string;title:string;html:string};
export type WebEvidenceSource="homepage"|"search"|"direct";
export type WebArticleCandidate={title:string;url:string;snippet?:string;publishedAt?:string;homepageRank?:number;searchRank?:number;discoveredFrom?:WebEvidenceSource};
export type WebResearchInput={query:string;sourceName?:string;domain?:string;url?:string;maxSources?:number};
export type WebResearchArticle={title:string;url:string;snippet:string;text:string;publishedAt?:string;source?:string};
export type WebResearchHeadline={title:string;url:string;snippet:string;publishedAt?:string;source?:string;discoveredFrom:WebEvidenceSource;fullyRead:boolean};
export type WebResearchResult={
  query:string;
  source?:{name?:string;domain?:string;url?:string};
  articles:WebResearchArticle[];
  headlines:WebResearchHeadline[];
  failedSources:Array<{url:string;error:string}>;
  partial:boolean;
  untrustedExternalContent:true;
};
