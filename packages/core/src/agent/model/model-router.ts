export type ModelProfile="FAST"|"BALANCED"|"QUALITY";
export type ModelRoute={profile:ModelProfile;model?:string;reason:string};
export type ModelRouterConfig={fast?:string;balanced?:string;quality?:string};

export class ModelRouter{
  constructor(private readonly config:ModelRouterConfig={fast:process.env.NEXO_MODEL_FAST??"qwen3:1.7b",balanced:process.env.NEXO_MODEL_BALANCED??"qwen3:4b",quality:process.env.NEXO_MODEL_QUALITY??"qwen3:8b"}){}
  route(request:string,stepCount=0):ModelRoute{
    const domains=[/e-?mail|gmail/i,/agenda|calend[aá]rio|reuni[aã]o/i,/arquivo|pasta|documento|pdf|docx/i,/site|web|internet|https?:\/\//i,/sistema|cpu|mem[oó]ria|disco/i].filter(pattern=>pattern.test(request)).length;
    const mutations=(request.match(/\b(crie|envie|salve|mova|apague|edite|agende|marque)\b/gi)??[]).length;
    if(domains>=2||mutations>=2||stepCount>=4||/compare|investigue|analise profundamente|pesquise e/i.test(request))return{profile:"QUALITY",model:this.config.quality??this.config.balanced,reason:"multi_domain_or_complex"};
    if(mutations===1||stepCount>=2||/resum|extraia|analise/i.test(request))return{profile:"BALANCED",model:this.config.balanced,reason:"structured_task"};
    return{profile:"FAST",model:this.config.fast??this.config.balanced,reason:"simple_task"};
  }
}
