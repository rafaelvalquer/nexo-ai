import { autoUpdater } from "electron-updater";

export function configureUpdater(enabled=false) {
  autoUpdater.autoDownload=true;
  autoUpdater.autoInstallOnAppQuit=true;
  if (!enabled) return;
  void autoUpdater.checkForUpdatesAndNotify().catch(()=>undefined);
}
