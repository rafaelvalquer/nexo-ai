import { safeStorage } from "electron";
import type { SecretStore } from "@nexo/core";
import fs from "node:fs";
import path from "node:path";

/** safeStorage is intentionally main-process only. Credentials never cross IPC. */
export class ElectronSecretStore implements SecretStore {
  constructor(private readonly storageFile:string){}
  private load():Record<string,string>{try{return JSON.parse(fs.readFileSync(this.storageFile,"utf8"));}catch{return{};}}
  private save(values:Record<string,string>){fs.mkdirSync(path.dirname(this.storageFile),{recursive:true});const temporary=`${this.storageFile}.tmp`;fs.writeFileSync(temporary,JSON.stringify(values),{mode:0o600});fs.renameSync(temporary,this.storageFile);}
  async set(key:string,value:string){if(!safeStorage.isEncryptionAvailable())throw new Error("A criptografia segura do Windows não está disponível.");const values=this.load();values[key]=safeStorage.encryptString(value).toString("base64");this.save(values);}
  async get(key:string){const encoded=this.load()[key];if(!encoded)return null;if(!safeStorage.isEncryptionAvailable())throw new Error("A criptografia segura do Windows não está disponível.");try{return safeStorage.decryptString(Buffer.from(encoded,"base64"));}catch{throw new Error("A credencial segura deste computador não pôde ser descriptografada. Reconecte a conta.");}}
  async delete(key:string){const values=this.load();delete values[key];this.save(values);}
}
