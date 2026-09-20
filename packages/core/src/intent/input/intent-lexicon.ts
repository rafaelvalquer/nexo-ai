export type IntentLexiconEntry={canonical:string;aliases?:readonly string[]};

export const INTENT_STRUCTURAL_LEXICON:readonly IntentLexiconEntry[]=[
  {canonical:"arquivo",aliases:["arquivos"]},
  {canonical:"pasta",aliases:["pastas"]},
  {canonical:"download",aliases:["downloads"]},
  {canonical:"documento",aliases:["documentos"]},
  {canonical:"pesquisar",aliases:["pesquise","pesquisa"]},
  {canonical:"procurar",aliases:["procure","buscar","busque"]},
  {canonical:"noticias",aliases:["noticia","manchetes"]},
  {canonical:"alterar",aliases:["altere","edite","editar","mude","modifique","substitua"]},
  {canonical:"escrever",aliases:["escreva"]},
  {canonical:"conteudo"},
  {canonical:"criar",aliases:["crie"]},
  {canonical:"mover",aliases:["mova"]},
  {canonical:"renomear",aliases:["renomeie"]},
  {canonical:"apagar",aliases:["apague","delete","deletar","excluir"]},
  {canonical:"abrir",aliases:["abra"]},
  {canonical:"site",aliases:["pagina","web","internet"]},
  {canonical:"email",aliases:["emails","gmail"]},
  {canonical:"agenda",aliases:["calendario","evento","reuniao","compromisso"]}
] as const;

export const STRUCTURAL_TOKENS=[...new Set(INTENT_STRUCTURAL_LEXICON.flatMap(entry=>[entry.canonical,...(entry.aliases??[])]).map(fold))];

export function fold(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
