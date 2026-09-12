import { motion } from "motion/react";
const prompts=["Analise meu computador","Veja meus documentos","Meus compromissos","Ver e-mails importantes"];
export function EmptyState({onPrompt}:{onPrompt:(value:string)=>void}){return <motion.section className="assistantEmptyState" initial={{opacity:0,scale:.98}} animate={{opacity:1,scale:1}}><div className="emptyOrb" aria-hidden="true">✦</div><span>NEXO AI</span><h2>Como posso ajudar?</h2><div>{prompts.map(prompt=><button className="suggestion" key={prompt} onClick={()=>onPrompt(prompt)}>{prompt}</button>)}</div></motion.section>;}
