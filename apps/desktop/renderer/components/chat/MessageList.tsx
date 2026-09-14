import type { BackgroundTask, ChatMessage as ChatMessageModel } from "@nexo/shared";
import { ChatMessage } from "./ChatMessage";
import { StreamingMessage } from "./StreamingMessage";
export function MessageList({messages,activeTask,elapsed,error}:{messages:ChatMessageModel[];activeTask?:BackgroundTask;elapsed:number;error:string|null}){
  const currentApprovalPersisted=activeTask?.pendingApprovalId&&messages.some(message=>message.taskId===activeTask.id&&message.blocks?.some(block=>block.type==="approval"&&block.approvalId===activeTask.pendingApprovalId));
  return <div className="messageList" aria-live="polite">{messages.map((message,index)=><ChatMessage key={message.id} message={message} grouped={index>0&&messages[index-1]?.role===message.role}/>)}{activeTask&&(activeTask.status!=="waiting_approval"||!currentApprovalPersisted)&&<StreamingMessage task={activeTask} elapsed={elapsed}/>} {error&&<p className="chatError" role="alert">Falha ao sincronizar: {error}</p>}</div>;
}
