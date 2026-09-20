import type {LearningFailureType} from "./learning-events.js";
export function isUserCorrection(text:string){return /\b(n[aã]o era isso|eu queria|n[aã]o era para|era o outro|quis dizer|corrigindo|na verdade)\b/i.test(text);}
export function classifyCorrection(text:string):LearningFailureType{
 const value=text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 if(/abrir|pesquisar|pesquisa|navegar|operacao/.test(value))return"wrong_operation";
 if(/outro arquivo|destinatario|pasta|downloads|documents|documentos/.test(value))return"wrong_entity";
 if(/anterior|contexto|isso nao/.test(value))return"stale_context";
 return"wrong_tool";
}
