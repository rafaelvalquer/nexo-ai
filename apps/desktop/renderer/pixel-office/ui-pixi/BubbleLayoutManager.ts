export type BubbleAnchor={id:string;x:number;y:number;width:number;height:number};
export type BubblePlacement={id:string;x:number;y:number};
type Rect={x:number;y:number;width:number;height:number};
const overlaps=(a:Rect,b:Rect,padding=8)=>!(a.x+a.width+padding<=b.x||b.x+b.width+padding<=a.x||a.y+a.height+padding<=b.y||b.y+b.height+padding<=a.y);
export class BubbleLayoutManager{
  layout(items:BubbleAnchor[],viewportWidth:number,viewportHeight:number):BubblePlacement[]{
    const placed:Rect[]=[],result:BubblePlacement[]=[];
    const ordered=[...items].sort((a,b)=>a.y-b.y||a.x-b.x);
    for(const item of ordered){
      const preferredX=item.x-item.width/2,preferredY=item.y-item.height-18;
      const x=Math.max(8,Math.min(viewportWidth-item.width-8,preferredX));
      let y=Math.max(8,Math.min(viewportHeight-item.height-8,preferredY));
      let rect={x,y,width:item.width,height:item.height};
      for(let attempts=0;attempts<10&&placed.some(other=>overlaps(rect,other));attempts++){
        y=Math.max(8,y-item.height*.55-8);rect={...rect,y};
      }
      if(placed.some(other=>overlaps(rect,other))){
        const direction=item.x<viewportWidth/2?-1:1;
        rect={...rect,x:Math.max(8,Math.min(viewportWidth-item.width-8,x+direction*(item.width*.72)))};
      }
      placed.push(rect);result.push({id:item.id,x:rect.x,y:rect.y});
    }
    return result;
  }
}
