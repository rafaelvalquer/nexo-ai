export const appRoutes = [
  "Dashboard",
  "Assistente",
  "Macros",
  "Escritório",
  "Configurações",
  "Aprovações",
  "Documentos",
  "Atividade",
  "Memória",
  "Diagnóstico",
  "Ferramentas",
  "Conexões",
] as const;

export type AppRoute = (typeof appRoutes)[number];
