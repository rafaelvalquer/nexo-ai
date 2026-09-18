import { useAppStore } from "../stores/app";

export function useDeveloperDiagnosticsEnabled() {
  return useAppStore(state => Boolean((state.status as { settings?: { developerDiagnosticsEnabled?: boolean } } | null)?.settings?.developerDiagnosticsEnabled));
}

export function developerDiagnosticsEnabled() {
  return Boolean((useAppStore.getState().status as { settings?: { developerDiagnosticsEnabled?: boolean } } | null)?.settings?.developerDiagnosticsEnabled);
}
