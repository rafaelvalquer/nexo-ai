export const brainRegionNames = ["frontal","parietal","temporal","occipital","central","inferior"] as const;

export function brainRegionFor(x:number,y:number){
  if(x>.72&&y>-.25)return 3;
  if(x>.22&&y<-.28)return 5;
  if(y>.28&&x<.62)return 1;
  if(x<-.52)return 0;
  if(y<.02)return 2;
  return 4;
}
