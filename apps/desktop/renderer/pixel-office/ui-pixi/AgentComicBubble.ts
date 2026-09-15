import { Container, Graphics, Text } from "../pixi-runtime";
import type { AgentHudSnapshot } from "../agent/OfficeAgent";

function clip(value: string, max: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
export class AgentComicBubble extends Container {
  private panel = new Graphics();
  private progress = new Graphics();
  private title = new Text({ text: "", style: { fontFamily: "system-ui, sans-serif", fontSize: 13, fontWeight: "700", fill: 0xffffff } });
  private subtitle = new Text({ text: "", style: { fontFamily: "system-ui, sans-serif", fontSize: 11, fill: 0xaeb9d4 } });
  private body = new Text({ text: "", style: { fontFamily: "system-ui, sans-serif", fontSize: 12, fill: 0xf5f7ff, wordWrap: true, wordWrapWidth: 216, lineHeight: 16 } });
  private meta = new Text({ text: "", style: { fontFamily: "ui-monospace, monospace", fontSize: 10, fill: 0x9ba8c6 } });
  private currentWidth = 240;
  private currentHeight = 106;
  constructor() {
    super();
    this.eventMode = "none";
    this.title.position.set(12, 9);
    this.subtitle.position.set(12, 28);
    this.body.position.set(12, 47);
    this.meta.position.set(12, 84);
    this.addChild(this.panel, this.progress, this.title, this.subtitle, this.body, this.meta);
  }
  get bubbleWidth() { return this.currentWidth; }
  get bubbleHeight() { return this.currentHeight; }
  updateContent(snapshot: AgentHudSnapshot) {
    const active = snapshot.active || snapshot.offline;
    this.currentWidth = active ? 240 : 170;
    this.currentHeight = active ? 106 : 48;
    const color = snapshot.severity === "error" ? 0xff6e7c : snapshot.severity === "warning" ? 0xffc857 : snapshot.color;
    this.panel.clear().roundRect(0, 0, this.currentWidth, this.currentHeight, 9)
      .fill({ color: 0x0d1224, alpha: active ? .97 : .9 }).stroke({ color, width: 1.5, alpha: active ? .9 : .5 });
    this.title.style.fill = snapshot.color;
    this.title.text = snapshot.name;
    this.subtitle.text = active ? clip(`${snapshot.deskName} · ${snapshot.project}`, 33) : `${snapshot.deskName} · ${snapshot.status}`;
    this.body.text = clip(snapshot.status, 65);
    this.body.visible = this.meta.visible = active;
    this.meta.text = snapshot.offline ? "OFFLINE" : `${snapshot.stationName} · ${Math.floor(snapshot.elapsedSeconds / 60)}:${String(snapshot.elapsedSeconds % 60).padStart(2, "0")}`;
    this.progress.clear();
    if (snapshot.active && typeof snapshot.progress === "number") {
      const value = Math.max(0, Math.min(1, snapshot.progress > 1 ? snapshot.progress / 100 : snapshot.progress));
      this.progress.rect(12, 100, 216, 2).fill(0x26304a).rect(12, 100, 216 * value, 2).fill(snapshot.color);
    }
  }
}

