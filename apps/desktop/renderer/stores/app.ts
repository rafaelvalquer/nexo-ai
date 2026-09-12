import { create } from "zustand";
import type { BackgroundTask, ChatMessage } from "@nexo/shared";

type Store = {
  page: string;
  setPage: (p: string) => void;
  status: unknown;
  setStatus: (s: unknown) => void;
  assistantMessages: ChatMessage[];
  assistantTasks: BackgroundTask[];
  assistantBusy: boolean;
  assistantError: string | null;
  syncAssistant: () => Promise<void>;
  sendAssistant: (text: string, attachmentIds?: string[]) => Promise<void>;
};

export const useAppStore = create<Store>((set, get) => ({
  page: "Hoje",
  setPage: page => set({ page }),
  status: null,
  setStatus: status => set({ status }),
  assistantMessages: [],
  assistantTasks: [],
  assistantBusy: false,
  assistantError: null,

  syncAssistant: async () => {
    try {
      const [messages, activeTasks] = await Promise.all([
        window.nexo.chatHistory(),
        window.nexo.listActiveTasks()
      ]);
      set({
        assistantMessages: messages,
        assistantTasks: activeTasks,
        assistantBusy: activeTasks.some((task: BackgroundTask) => task.type === "assistant-chat"),
        assistantError: null
      });
    } catch (error) {
      set({ assistantError: error instanceof Error ? error.message : String(error) });
    }
  },

  sendAssistant: async (text: string, attachmentIds: string[] = []) => {
    const value = text.trim();
    if (!value) return;
    try {
      set({ assistantBusy: true, assistantError: null });
      await window.nexo.startChatTask(value, attachmentIds);
      await get().syncAssistant();
    } catch (error) {
      set({
        assistantBusy: false,
        assistantError: error instanceof Error ? error.message : String(error)
      });
    }
  }
}));
