import { Container, Graphics, Rectangle, Sprite, Texture } from "../pixi-runtime";
import { OCTOPUS_SPRITE, type OctopusAnimation } from "../data/sprite-manifest";

export class AgentSprite extends Container {
  readonly visualScale = .42;
  readonly interactionBounds = new Rectangle(-50, -94, 100, 102);
  readonly navigationFootprint = { width: 28, height: 20 };
  private poses: Texture[];
  private sprite = new Sprite();
  private shadow = new Graphics();
  private animation: OctopusAnimation = "idle";
  private life = 0;

  constructor(sheet: Texture, row = 0) {
    super();
    this.poses = [0, 1, 2, 3].map(col => new Texture({ source: sheet.source, frame: new Rectangle(col * 256, row * 256, 256, 256) }));
    this.shadow.ellipse(0, 1, 30, 8).fill({ color: 0x050814, alpha: .4 });
    this.sprite.anchor.set(.5, 240 / 256);
    this.sprite.scale.set(this.visualScale);
    this.sprite.texture = this.poses[0];
    this.addChild(this.shadow, this.sprite);
    this.eventMode = "none";
  }
  play(animation: OctopusAnimation) {
    this.animation = animation;
    this.sprite.texture = this.poses[OCTOPUS_SPRITE.animationColumn[animation]];
    this.sprite.alpha = animation === "offline" ? .55 : 1;
  }
  update(deltaSeconds: number, reduced = false) {
    this.life += deltaSeconds;
    const walking = this.animation.startsWith("walk");
    const working = OCTOPUS_SPRITE.animationColumn[this.animation] === 3 && !walking;
    const phase = this.life * (walking ? 13 : working ? 9 : 3);
    this.sprite.position.y = reduced ? 0 : Math.sin(phase) * (walking ? 2 : working ? .6 : .4);
    this.sprite.rotation = reduced || !walking ? 0 : Math.sin(phase) * .025;
    this.sprite.scale.set(this.visualScale, this.visualScale * (1 + (reduced ? 0 : Math.sin(phase) * (walking ? .025 : working ? .009 : .003))));
  }
  override destroy() {
    super.destroy({ children: true });
    for (const texture of this.poses) texture.destroy(false);
  }
}

