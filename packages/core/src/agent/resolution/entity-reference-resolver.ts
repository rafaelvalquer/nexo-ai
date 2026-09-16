export type ConversationEntity={kind:"email"|"file"|"document"|"event";id:string;label?:string;path?:string;ordinal:number};
export interface EntityLedgerReader{list(conversationId:string,kind?:ConversationEntity["kind"]):ConversationEntity[];}

const ORDINALS:Record<string,number>={primeiro:1,primeira:1,segundo:2,segunda:2,terceiro:3,terceira:3,quarto:4,quarta:4,quinto:5,quinta:5};
export class EntityReferenceResolver{
  constructor(private readonly ledger:EntityLedgerReader){}
  resolve(conversationId:string,text:string){
    const normalized=text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    const ordinal=Object.entries(ORDINALS).find(([word])=>new RegExp(`\\b${word}\\b`).test(normalized))?.[1];
    if(!ordinal)return undefined;
    const kind:ConversationEntity["kind"]=/e-?mail|mensagem/.test(normalized)?"email":/evento|compromisso|reuniao/.test(normalized)?"event":/documento/.test(normalized)?"document":"file";
    return this.ledger.list(conversationId,kind).find(entity=>entity.ordinal===ordinal);
  }
}
