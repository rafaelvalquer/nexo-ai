export type BrainPoint2D = readonly [number, number];

export const BRAIN_OUTLINE: readonly BrainPoint2D[] = [
  [-1.44, 0.00],
  [-1.40, 0.30],
  [-1.28, 0.55],
  [-1.04, 0.73],
  [-0.72, 0.82],
  [-0.36, 0.84],
  [-0.02, 0.78],
  [0.30, 0.82],
  [0.62, 0.74],
  [0.91, 0.61],
  [1.18, 0.42],
  [1.36, 0.18],
  [1.41, -0.05],
  [1.30, -0.27],
  [1.08, -0.36],
  [0.98, -0.52],
  [0.78, -0.67],
  [0.50, -0.72],
  [0.27, -0.62],
  [0.02, -0.55],
  [-0.30, -0.66],
  [-0.66, -0.63],
  [-0.98, -0.50],
  [-1.24, -0.31],
  [-1.40, -0.13]
] as const;

export const BRAIN_BOUNDS = {minX:-1.45,maxX:1.45,minY:-0.85,maxY:0.85,maxZ:.09} as const;
export const BRAIN_TOPOLOGY_VERSION = "brain-v1";

export function isPointInsideBrain(x:number,y:number){
  let inside=false;
  for(let i=0,j=BRAIN_OUTLINE.length-1;i<BRAIN_OUTLINE.length;j=i++){
    const [xi,yi]=BRAIN_OUTLINE[i],[xj,yj]=BRAIN_OUTLINE[j];
    const crosses=((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi||Number.EPSILON)+xi);
    if(crosses)inside=!inside;
  }
  return inside;
}

export function segmentInsideBrain(a:readonly[number,number],b:readonly[number,number]){
  for(const t of [.2,.4,.6,.8]){
    const x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;
    if(!isPointInsideBrain(x,y))return false;
  }
  return true;
}
