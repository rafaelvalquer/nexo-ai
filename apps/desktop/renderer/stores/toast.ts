import { create } from "zustand";
export type ToastItem={id:string;title:string;description?:string;tone:"success"|"error"|"info"};
type ToastStore={items:ToastItem[];show:(toast:Omit<ToastItem,"id">)=>void;dismiss:(id:string)=>void};
export const useToastStore=create<ToastStore>(set=>({items:[],show:toast=>{const item={...toast,id:crypto.randomUUID()};set(state=>({items:[...state.items,item].slice(-4)}));window.setTimeout(()=>set(state=>({items:state.items.filter(current=>current.id!==item.id)})),5000);},dismiss:id=>set(state=>({items:state.items.filter(item=>item.id!==id)}))}));
