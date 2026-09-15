import { Container,Rectangle,Sprite,Texture } from "../pixi-runtime";
import { OCCLUSION_BANDS } from "../data/occlusion-manifest";

export class OcclusionLayer{
  readonly sprites:Sprite[]=[];
  constructor(texture:Texture){
    for(const band of OCCLUSION_BANDS){
      const frame=new Rectangle(band.x,band.y,band.width,band.height);
      const slice=new Texture({source:texture.source,frame});
      const sprite=new Sprite(slice);
      sprite.position.set(band.x,band.y);
      sprite.zIndex=band.sortY;
      sprite.eventMode="none";
      this.sprites.push(sprite);
    }
  }
  mount(target:Container){
    for(const sprite of this.sprites)target.addChild(sprite);
  }
  destroy(){
    for(const sprite of this.sprites)sprite.texture.destroy(false);
    this.sprites.length=0;
  }
}
