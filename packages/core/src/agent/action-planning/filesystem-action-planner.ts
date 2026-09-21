import path from "node:path";
import type {ToolAvailability,CanonicalPlanningContext,DomainActionPlanner} from "./planning-types.js";
import type {CanonicalActionPlan} from "./canonical-action-plan.js";
import type {CanonicalIntentDecision} from "./canonical-intent-decision.js";
import {planBase,readStep,stringRaw,stringValue,unavailable,writeStep,numberValue} from "./planning-utils.js";
import {resolveKnownFolder,resolveUserPath} from "../../filesystem/path-resolver.js";

export class FilesystemActionPlanner implements DomainActionPlanner{
  constructor(private readonly tools:ToolAvailability){}
  plan(decision:CanonicalIntentDecision,_context:CanonicalPlanningContext={}):CanonicalActionPlan|undefined{
    const e=decision.entities;
    const operation=canonicalOperation(decision.operation);
    const resolvedPath=resolvePath(e);
    const folder=resolveFolder(e);

    if(operation==="create_folder"){
      const target=resolvedPath??joinFolderName(folder,stringValue(e.name));
      if(!target)return planBase(decision,[],{direct:"Qual é o nome da pasta e onde ela deve ser criada?"});
      const step=writeStep(this.tools,"create_folder",{path:target},`Preparando a criação da pasta ${path.basename(target)}…`,approval("create",target,"Uma nova pasta será criada."));
      return step?planBase(decision,[step],{responseMode:"deterministic",expectedEffect:"folder_created"}):unavailable(decision,"create_folder");
    }

    if(operation==="create_text_file"){
      const target=resolvedPath??joinFolderName(folder,stringValue(e.name));
      if(!target)return planBase(decision,[],{direct:"Qual é o nome do arquivo e onde ele deve ser criado?"});
      const content=stringRaw(e.content)??"";
      const step=writeStep(this.tools,"create_text_file",{path:target,content},`Preparando a criação de ${path.basename(target)}…`,approval("create",target,"Um novo arquivo de texto será criado."));
      return step?planBase(decision,[step],{responseMode:"deterministic",expectedEffect:"file_created"}):unavailable(decision,"create_text_file");
    }

    if(operation==="find_file"){
      const name=stringValue(e.name??e.file);if(!name)return planBase(decision,[],{direct:"Qual arquivo você quer procurar?"});
      const root=stringValue(e.root)??folder;
      const step=readStep(this.tools,"find_file",{name,matchMode:path.extname(name)?"full_name":"stem",...(root?{root}:{}),maxResults:numberValue(e.maxResults,20,1,50)},`Procurando ${name} nas pastas autorizadas…`);
      return step?planBase(decision,[step],{responseMode:"presentation",expectedEffect:"files_found"}):unavailable(decision,"find_file");
    }

    if(operation==="search_files"){
      const query=stringValue(e.query??e.file??e.name);if(!query)return planBase(decision,[],{direct:"Qual arquivo ou termo você quer pesquisar?"});
      const step=readStep(this.tools,"search_files",{query,...(folder?{path:folder}:{}),maxDepth:numberValue(e.maxDepth,4,0,8)},`Pesquisando ${query}…`);
      return step?planBase(decision,[step],{responseMode:"presentation",expectedEffect:"files_found"}):unavailable(decision,"search_files");
    }

    if(operation==="list_files"){
      if(!folder)return planBase(decision,[],{direct:"Qual pasta você quer listar? Você pode usar Downloads, Documentos ou Desktop."});
      const step=readStep(this.tools,"list_files",{path:folder,kind:e.kind,sortBy:e.sortBy,sortDirection:e.sortDirection,limit:numberValue(e.limit,100,1,100)},`Listando itens em ${folder}…`);
      return step?planBase(decision,[step],{responseMode:"presentation",expectedEffect:"files_listed"}):unavailable(decision,"list_files");
    }

    if(operation==="largest_files"){
      if(!folder&&!resolvedPath)return planBase(decision,[],{direct:"Qual pasta você quer analisar?"});
      const target=folder??resolvedPath!;
      const step=readStep(this.tools,"largest_files",{path:target,limit:numberValue(e.limit,15,1,50),maxDepth:numberValue(e.maxDepth,4,0,8)},`Analisando os maiores arquivos em ${target}…`);
      return step?planBase(decision,[step],{responseMode:"presentation",expectedEffect:"largest_files_listed"}):unavailable(decision,"largest_files");
    }

    if(operation==="open_file"||operation==="open_path"){
      if(resolvedPath&&isAbsolutePortable(resolvedPath)){
        const step=readStep(this.tools,"open_path",{path:resolvedPath},`Abrindo ${path.basename(resolvedPath)}…`);
        return step?planBase(decision,[step],{responseMode:"deterministic",expectedEffect:"file_opened"}):unavailable(decision,"open_path");
      }
      const fileName=stringValue(e.file??e.name);
      if(!fileName)return planBase(decision,[],{direct:"Qual arquivo você quer abrir?"});
      const step=readStep(this.tools,"find_file",{name:fileName,matchMode:path.extname(fileName)?"full_name":"stem",...(folder?{root:folder}:{})},`Localizando ${fileName} antes de abrir…`);
      return step?planBase(decision,[step],{deferredAction:{kind:"filesystem.open",fileName,...(folder?{root:folder}:{})},responseMode:"deterministic",expectedEffect:"file_opened"}):unavailable(decision,"find_file");
    }

    if(operation==="read_file"||operation==="file_info"){
      if(!resolvedPath)return planBase(decision,[],{direct:"Qual arquivo você quer usar e em qual pasta ele está?"});
      const step=readStep(this.tools,operation,{path:resolvedPath,...(operation==="read_file"?{maxChars:numberValue(e.maxChars,30000,100,200000)}:{})},operation==="read_file"?`Lendo ${path.basename(resolvedPath)}…`:`Consultando ${path.basename(resolvedPath)}…`);
      return step?planBase(decision,[step],{responseMode:operation==="read_file"?"synthesize":"deterministic"}):unavailable(decision,operation);
    }

    if(operation==="write_text_file"){
      const content=stringRaw(e.content);if(content===undefined)return planBase(decision,[],{direct:"Qual conteúdo você quer gravar no arquivo?"});
      if(resolvedPath&&isAbsolutePortable(resolvedPath)){
        const step=writeStep(this.tools,"write_text_file",{path:resolvedPath,content},"Preparando a alteração do arquivo…",{
          domain:"filesystem",actionType:"update",affectedCount:1,preview:`Nome: ${path.basename(resolvedPath)}\nCaminho: ${resolvedPath}\nNovo conteúdo:\n${previewText(content)}`,consequence:"O conteúdo atual do arquivo será substituído pelo novo conteúdo informado.",expiresInMs:5*60_000
        });
        return step?planBase(decision,[step],{responseMode:"deterministic",expectedEffect:"file_content_replaced"}):unavailable(decision,"write_text_file");
      }
      const fileName=stringValue(e.file??e.name);if(!fileName)return planBase(decision,[],{direct:"Qual arquivo você quer alterar?"});
      const root=stringValue(e.root)??folder;
      const step=readStep(this.tools,"find_file",{name:fileName,matchMode:path.extname(fileName)?"full_name":"stem",...(root?{root}:{})},`Localizando ${fileName} antes da alteração…`);
      return step?planBase(decision,[step],{deferredAction:{kind:"filesystem.write_text",fileName,content,...(root?{root}:{})},responseMode:"deterministic",requiresApproval:true,expectedEffect:"file_content_replaced"}):unavailable(decision,"find_file");
    }

    if(operation==="copy_file"||operation==="move_file"){
      const source=stringValue(e.source),destination=stringValue(e.destination);
      if(!source||!destination)return planBase(decision,[],{direct:"Informe a origem e o destino da operação."});
      const verb=operation==="copy_file"?"cópia":"movimentação";
      const step=writeStep(this.tools,operation,{source,destination},`Preparando a ${verb} do arquivo…`,{domain:"filesystem",actionType:operation==="copy_file"?"copy":"move",affectedCount:1,preview:`${source}\n→ ${destination}`,consequence:operation==="copy_file"?"Uma cópia será criada no destino.":"O arquivo será movido para o destino.",expiresInMs:10*60_000});
      return step?planBase(decision,[step],{responseMode:"deterministic"}):unavailable(decision,operation);
    }

    if(operation==="rename_file"){
      const current=stringValue(e.path),newName=stringValue(e.newName??e.newPath);
      if(!current||!newName)return planBase(decision,[],{direct:"Qual arquivo deve ser renomeado e qual é o novo nome?"});
      const newPath=isAbsolutePortable(newName)?newName:joinPortable(path.dirname(current),newName);
      const step=writeStep(this.tools,"rename_file",{path:current,newPath},"Preparando a renomeação do arquivo…",{domain:"filesystem",actionType:"rename",affectedCount:1,preview:`${current}\n→ ${newPath}`,consequence:"O arquivo será renomeado.",expiresInMs:10*60_000});
      return step?planBase(decision,[step],{responseMode:"deterministic"}):unavailable(decision,"rename_file");
    }

    if(operation==="trash_file"){
      if(!resolvedPath)return planBase(decision,[],{direct:"Qual arquivo você quer mover para a lixeira?"});
      const inspect=readStep(this.tools,"file_info",{path:resolvedPath},"Confirmando o arquivo antes de preparar a remoção…");
      return inspect?planBase(decision,[inspect],{deferredAction:{kind:"filesystem.trash",path:resolvedPath},responseMode:"deterministic",requiresApproval:true,expectedEffect:"file_trashed"}):unavailable(decision,"file_info");
    }

    return undefined;
  }
}

function canonicalOperation(value:string){return value==="open_path"?"open_file":value;}
function resolvePath(e:Record<string,unknown>){
  const resolved=resolveUserPath({path:e.path,folder:e.folder,file:e.file??e.name});
  return resolved??stringValue(e.path);
}
function resolveFolder(e:Record<string,unknown>){
  const direct=stringValue(e.root)??stringValue(e.folder);
  if(!direct)return resolveUserPath({path:e.path,folder:e.folder})??undefined;
  return resolveKnownFolder(direct)??(isAbsolutePortable(direct)?direct:resolveUserPath({folder:direct})??undefined);
}
function joinFolderName(folder:string|undefined,name:string|undefined){return folder&&name?joinPortable(folder,name):undefined;}
function joinPortable(base:string,relative:string){const segments=relative.split(/[\\/]+/).filter(Boolean);return path.win32.isAbsolute(base)?path.win32.join(base,...segments):path.join(base,...segments);}
function isAbsolutePortable(value:string){return path.isAbsolute(value)||path.win32.isAbsolute(value);}
function approval(actionType:string,target:string,consequence:string){return{domain:"filesystem",actionType,preview:target,affectedCount:1,consequence,expiresInMs:10*60_000};}
function previewText(value:string){return value.length<=1000?value:`${value.slice(0,1000)}\n… (${value.length-1000} caracteres adicionais)`;}
