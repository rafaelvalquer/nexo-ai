import { Skeleton } from "./Skeleton";
import "./page-loading.css";

type Props = { page: string };

export function PageLoading({ page }: Props) {
  const variant = page === "Assistente" ? "assistant" : page === "Macros" ? "macros" : page === "Escritório" ? "office" : page === "Configurações" ? "settings" : page === "Documentos" ? "documents" : "default";

  return (
    <div className={`routeLoading routeLoading-${variant}`} aria-hidden="true">
      <header className="routeLoadingHeader">
        <Skeleton className="routeLoadingEyebrow" />
        <Skeleton className="routeLoadingTitle" />
      </header>
      {variant === "assistant" ? (
        <div className="routeLoadingAssistant">
          <Skeleton className="routeLoadingChatList" />
          <div className="routeLoadingConversation">
            <Skeleton className="routeLoadingMessage routeLoadingMessageUser" />
            <Skeleton className="routeLoadingMessage routeLoadingMessageAssistant" />
            <Skeleton className="routeLoadingComposer" />
          </div>
        </div>
      ) : variant === "macros" ? (
        <div className="routeLoadingMacroGrid">{[0, 1, 2].map(item => <Skeleton className="routeLoadingMacroCard" key={item} />)}</div>
      ) : variant === "office" ? (
        <div className="routeLoadingOffice"><Skeleton className="routeLoadingCanvas" /><Skeleton className="routeLoadingOfficeRail" /></div>
      ) : variant === "settings" ? (
        <div className="routeLoadingSettings"><Skeleton className="routeLoadingSettingsNav" /><div>{[0, 1, 2, 3, 4].map(item => <Skeleton className="routeLoadingSettingRow" key={item} />)}</div></div>
      ) : variant === "documents" ? (
        <div className="routeLoadingDocumentList">{[0, 1, 2, 3].map(item => <Skeleton className="routeLoadingDocumentRow" key={item} />)}</div>
      ) : (
        <div className="routeLoadingCardGrid">{[0, 1, 2].map(item => <Skeleton className="routeLoadingCard" key={item} />)}</div>
      )}
    </div>
  );
}
