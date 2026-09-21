export type WebDestination={name:string;url:string;domain:string};

const DESTINATIONS:Record<string,WebDestination>={
  wikipedia:{name:"Wikipedia",url:"https://www.wikipedia.org/",domain:"wikipedia.org"},
  infomoney:{name:"InfoMoney",url:"https://www.infomoney.com.br/",domain:"infomoney.com.br"},
  google:{name:"Google",url:"https://www.google.com/",domain:"google.com"},
  github:{name:"GitHub",url:"https://github.com/",domain:"github.com"},
  linkedin:{name:"LinkedIn",url:"https://www.linkedin.com/",domain:"linkedin.com"},
  youtube:{name:"YouTube",url:"https://www.youtube.com/",domain:"youtube.com"}
};

export class WebDestinationResolver{
  resolveKnown(name?:string):WebDestination|undefined{
    if(!name)return undefined;
    return DESTINATIONS[fold(name)];
  }
  knownAliases(){return Object.values(DESTINATIONS).map(item=>({...item}));}
}
function fold(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");}
