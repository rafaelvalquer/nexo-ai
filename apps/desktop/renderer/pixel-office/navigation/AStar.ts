import type { GridPoint } from "./Grid";
import { Grid } from "./Grid";

type HeapEntry={id:number;priority:number};

class MinHeap{
  private items:HeapEntry[]=[];

  get size(){return this.items.length;}

  push(entry:HeapEntry){
    this.items.push(entry);
    let index=this.items.length-1;
    while(index>0){
      const parent=Math.floor((index-1)/2);
      if(this.items[parent].priority<=entry.priority)break;
      this.items[index]=this.items[parent];
      index=parent;
    }
    this.items[index]=entry;
  }

  pop(){
    if(!this.items.length)return undefined;
    const root=this.items[0];
    const last=this.items.pop()!;
    if(!this.items.length)return root;
    let index=0;
    while(true){
      const left=index*2+1,right=left+1;
      if(left>=this.items.length)break;
      let child=left;
      if(right<this.items.length&&this.items[right].priority<this.items[left].priority)child=right;
      if(this.items[child].priority>=last.priority)break;
      this.items[index]=this.items[child];
      index=child;
    }
    this.items[index]=last;
    return root;
  }
}

const heuristic=(a:GridPoint,b:GridPoint)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const toId=(grid:Grid,point:GridPoint)=>point.y*grid.width+point.x;
const fromId=(grid:Grid,id:number):GridPoint=>({x:id%grid.width,y:Math.floor(id/grid.width)});

export function findPath(grid:Grid,start:GridPoint,goal:GridPoint){
  if(!grid.isWalkable(start)||!grid.isWalkable(goal))return[];

  const nodeCount=grid.width*grid.height;
  const startId=toId(grid,start),goalId=toId(grid,goal);
  const cameFrom=new Int32Array(nodeCount);
  cameFrom.fill(-1);
  const gScore=new Float64Array(nodeCount);
  gScore.fill(Number.POSITIVE_INFINITY);
  gScore[startId]=0;
  const closed=new Uint8Array(nodeCount);
  const open=new MinHeap();
  open.push({id:startId,priority:heuristic(start,goal)});

  while(open.size){
    const entry=open.pop()!;
    if(closed[entry.id])continue;
    if(entry.id===goalId){
      const reversed:GridPoint[]=[];
      let cursor=goalId;
      while(cursor!==-1){
        reversed.push(fromId(grid,cursor));
        cursor=cameFrom[cursor];
      }
      reversed.reverse();
      return reversed;
    }

    closed[entry.id]=1;
    const current=fromId(grid,entry.id);
    const baseScore=gScore[entry.id]+1;
    for(const next of grid.neighbors(current)){
      const nextId=toId(grid,next);
      if(closed[nextId]||baseScore>=gScore[nextId])continue;
      cameFrom[nextId]=entry.id;
      gScore[nextId]=baseScore;
      open.push({id:nextId,priority:baseScore+heuristic(next,goal)});
    }
  }

  return[];
}
