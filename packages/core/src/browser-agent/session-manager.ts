import { spawn, type ChildProcess } from "node:child_process";
import { access, mkdir, mkdtemp, open, readFile, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BrowserAgentMode } from "@nexo/shared/browser-agent";

export type BrowserAgentSession = { cdpUrl:string; profileDir:string; mode:BrowserAgentMode; process:ChildProcess; close:()=>Promise<void> };

/** Separate browser ownership for Browser Use. The legacy BrowserSessionManager is intentionally untouched. */
export class BrowserAgentSessionManager {
  private readonly root:string;
  private readonly profiles:string;
  private readonly workspaces:string;
  constructor(dataDir:string) {
    this.root = path.join(dataDir, "browser-agent");
    this.profiles = path.join(this.root, "profiles");
    this.workspaces = path.join(this.root, "workspaces");
  }
  async initialize() { await Promise.all([mkdir(this.profiles, {recursive:true}), mkdir(this.workspaces, {recursive:true})]); }
  workspace(runId:string) { return path.join(this.workspaces, runId); }

  async create(runId:string, mode:BrowserAgentMode):Promise<BrowserAgentSession> {
    await this.initialize();
    const executable = await findBrowserExecutable();
    const workspace = this.workspace(runId);
    await mkdir(workspace, {recursive:true, mode:0o700});
    const persistent = mode === "personal";
    const profile = persistent ? path.join(this.profiles, "personal") : await mkdtemp(path.join(workspace, "profile-"));
    await mkdir(profile, {recursive:true, mode:0o700});
    const resolvedProfile = await realpath(profile);
    const lockPath = path.join(resolvedProfile, ".nexo-browser-agent.lock");
    await recoverStaleLock(lockPath);
    const lock = await open(lockPath, "wx", 0o600).catch(() => { throw new Error("O perfil do Browser Agent já está em uso por outra execução."); });
    await lock.writeFile(JSON.stringify({runId, pid:process.pid, createdAt:new Date().toISOString()}));
    const child = spawn(executable, [
      `--user-data-dir=${resolvedProfile}`,
      "--remote-debugging-port=0",
      "--remote-debugging-address=127.0.0.1",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--window-size=1440,900",
      ...(mode === "research" ? ["--headless=new"] : []),
      "about:blank"
    ], { stdio:"ignore", windowsHide:mode === "research" });
    let spawnError:Error|undefined;
    child.once("error", error => { spawnError = error; });
    let endpoint = "";
    const deadline = Date.now() + 15_000;
    try {
      while (Date.now() < deadline) {
        if (spawnError) throw spawnError;
        if (child.exitCode !== null) throw new Error("Chrome encerrou antes de disponibilizar o CDP.");
        try {
          const [port, wsPath] = (await readFile(path.join(resolvedProfile, "DevToolsActivePort"), "utf8")).trim().split("\n");
          if (port && wsPath) { endpoint = `ws://127.0.0.1:${Number(port)}${wsPath}`; break; }
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 60));
      }
      if (!endpoint) throw new Error("Chrome não disponibilizou o endpoint CDP dentro do tempo limite.");
    } catch (error) {
      child.kill();
      await lock.close().catch(() => undefined);
      await rm(lockPath, {force:true});
      if (!persistent) await rm(resolvedProfile, {recursive:true, force:true});
      throw error;
    }
    let closed = false;
    return {
      cdpUrl:endpoint,
      profileDir:resolvedProfile,
      mode,
      process:child,
      close:async () => {
        if (closed) return;
        closed = true;
        if (child.exitCode === null) {
          const exit = new Promise<void>(resolve => child.once("exit", () => resolve()));
          child.kill("SIGTERM");
          const force = setTimeout(() => child.kill("SIGKILL"), 2500);
          await Promise.race([exit, new Promise<void>(resolve => setTimeout(resolve, 3000))]);
          clearTimeout(force);
        }
        await lock.close().catch(() => undefined);
        await rm(lockPath, {force:true});
        if (!persistent) await rm(resolvedProfile, {recursive:true, force:true});
      }
    };
  }
}

async function recoverStaleLock(lockPath:string) {
  try {
    const payload = JSON.parse(await readFile(lockPath, "utf8")) as {pid?:number};
    if (payload.pid && processAlive(payload.pid)) return;
    await rm(lockPath, {force:true});
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return;
    // A malformed lock is stale only if no valid owner can be proven.
    if (error instanceof SyntaxError) { await rm(lockPath, {force:true}); return; }
  }
}
function processAlive(pid:number) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}

async function findBrowserExecutable() {
  const candidates = process.platform === "win32" ? [
    path.join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Microsoft/Edge/Application/msedge.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "Microsoft/Edge/Application/msedge.exe"),
    path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData/Local"), "Google/Chrome/Application/chrome.exe"),
    path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData/Local"), "Microsoft/Edge/Application/msedge.exe")
  ] : process.platform === "darwin" ? [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  ] : [
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge"
  ];
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch {}
  }
  throw new Error("Chrome ou Edge não foi encontrado. Instale um navegador Chromium para usar o Browser Agent.");
}
