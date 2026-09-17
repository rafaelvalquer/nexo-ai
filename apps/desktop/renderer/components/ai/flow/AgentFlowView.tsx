import type { BackgroundTask } from "@nexo/shared";

export function AgentFlowView({task}:{task?:BackgroundTask}){
  const history=task?.statusHistory?.filter(Boolean).slice(-8)??[];
  const entries=history.length?history:[task?.statusMessage??"Aguardando uma execução"];
  const running=task?.status==="running";
  return <section className="agentFlow" aria-label="Etapas da execução"><header><small>ETAPAS DA EXECUÇÃO</small><span>{running?"Em andamento":task?.status??"Aguardando"}</span></header><ol className="agentFlowList" aria-live={running?"polite":undefined}>{entries.map((label,index)=><li className={running&&index===entries.length-1?"active":""} key={`${index}-${label}`}><span aria-hidden="true">{running&&index===entries.length-1?"●":"✓"}</span><p>{label}</p></li>)}</ol></section>;
}
