import { NexoCore, type NexoCoreProps } from "./NexoCore";

/** @deprecated Use NexoCore. Mantido para preservar consumidores existentes durante a migração visual. */
export function NexoOrb({compact=false,...props}:Omit<NexoCoreProps,"variant">&{compact?:boolean}) {
  return <NexoCore {...props} variant={compact?"compact":"standard"}/>;
}
