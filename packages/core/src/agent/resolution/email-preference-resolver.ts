import type { EmailSearchPreferenceService } from "../../email/preferences/service.js";
import type { EmailMailboxPreferenceCategory } from "../../email/preferences/types.js";

export class EmailPreferenceResolver{
  constructor(private readonly preferences:EmailSearchPreferenceService){}
  resolve(connectionId:string,explicit?:EmailMailboxPreferenceCategory[]){return this.preferences.resolveCategories(connectionId,explicit);}
}
