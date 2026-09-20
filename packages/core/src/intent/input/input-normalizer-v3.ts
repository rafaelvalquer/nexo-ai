import type {NormalizedIntentInput} from "../types.js";
import {extractLiteralSpans} from "./literal-span-extractor.js";
import {normalizeStructuralTypos,type FuzzyCorrection} from "./fuzzy-token-normalizer.js";

export type NormalizedIntentInputV3=NormalizedIntentInput&{routingCorrections:FuzzyCorrection[]};

export function normalizeIntentInputV3(text:string):NormalizedIntentInputV3{
  const original=text;
  const normalizedLineEndings=text.normalize("NFKC").replace(/\r\n?/g,"\n");
  const extracted=extractLiteralSpans(original);
  const fuzzy=normalizeStructuralTypos(normalizedLineEndings,extracted.protectedSpans);
  const routingText=fuzzy.text.replace(/[\t\n ]+/g," ").trim();
  const quoted=extracted.literalSegments.filter(segment=>segment.type==="quoted").map(segment=>segment.value);
  const extensions=[...new Set([...normalizedLineEndings.matchAll(/\.([A-Za-z0-9]{1,12})\b/gu)].map(match=>match[1].toLowerCase()))];
  return{original,routingText,normalized:normalizedLineEndings.trim(),literalSegments:extracted.literalSegments,quoted,explicitPaths:extracted.explicitPaths,extensions,routingCorrections:fuzzy.corrections};
}
