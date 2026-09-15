import { Container } from "../pixi-runtime";

export class WorldLayers{
  readonly depth=new Container();
  readonly effects=new Container();
  readonly debug=new Container();
  constructor(){
    this.depth.sortableChildren=true;
    this.effects.sortableChildren=true;
    this.depth.zIndex=10;
    this.effects.zIndex=20;
    this.debug.zIndex=5000;
  }
}
