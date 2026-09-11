import { autoUpdater } from "electron-updater";

export function configureUpdater(enabled=false) {
  autoUpdater.autoDownload=false;
  if (!enabled) return;
  void autoUpdater.checkForUpdates().catch(()=>undefined);
}
