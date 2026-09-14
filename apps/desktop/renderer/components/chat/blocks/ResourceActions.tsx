import type { ResourceItem, ResourceAction } from "@nexo/shared";
import { ActionIconButton } from "./ActionIconButton";
export function ResourceActions({item,onAction}:{item:ResourceItem;onAction:(action:ResourceAction)=>void}) {
  const busy=["preparing","executing","awaiting_approval"].includes(item.state??"");
  return <div className="resourceCardActions" role="group" aria-label="Ações do recurso">{item.actions.map(action=><ActionIconButton key={action.id} action={action} busy={busy} onClick={()=>onAction(action)}/>)}</div>;
}
