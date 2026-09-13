import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type DesktopStoragePaths={root:string;database:string;secrets:string;logs:string};

export function createDesktopStoragePaths():DesktopStoragePaths{
  const root=process.env.NEXO_DATA_DIR
    ?path.resolve(process.env.NEXO_DATA_DIR)
    :path.join(process.env.APPDATA??path.join(os.homedir(),"AppData","Roaming"),"NexoAI");
  return{root,database:path.join(root,"nexo.db"),secrets:path.join(root,"secrets.enc.json"),logs:path.join(root,"logs")};
}

export function migrateLegacySecrets(target:string,legacyCandidates:string[]){
  if(fs.existsSync(target))return false;
  const source=legacyCandidates.find(candidate=>candidate&&path.resolve(candidate)!==path.resolve(target)&&fs.existsSync(candidate));
  if(!source)return false;
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(source,target);
  return true;
}
