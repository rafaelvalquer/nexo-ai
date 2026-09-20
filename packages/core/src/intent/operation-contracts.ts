import type {IntentOperationContract} from "./contracts/types.js";
import {filesystemIntentContracts} from "./contracts/filesystem.js";
import {webIntentContracts} from "./contracts/web.js";
import {emailIntentContracts} from "./contracts/email.js";
import {calendarIntentContracts} from "./contracts/calendar.js";
import {documentIntentContracts} from "./contracts/documents.js";
import {browserIntentContracts} from "./contracts/browser.js";
import {systemIntentContracts} from "./contracts/system.js";

export type IntentEntityKey=string;
export type {IntentOperationContract};
export const intentOperationContracts:Record<string,IntentOperationContract>={
 ...filesystemIntentContracts,...webIntentContracts,...emailIntentContracts,...calendarIntentContracts,...documentIntentContracts,...browserIntentContracts,...systemIntentContracts,
 unknown:{intent:"unknown",allowedEntities:[],requiredEntities:[],optionalEntities:[]}
};
