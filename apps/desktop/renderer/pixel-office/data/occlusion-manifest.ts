import { OFFICE_HEIGHT,OFFICE_WIDTH } from "./office-layout";

export type OcclusionBand={id:string;x:number;y:number;width:number;height:number;sortY:number};
export const OCCLUSION_BAND_HEIGHT=48;

/**
 * The foreground art is a full-size transparent texture. Splitting it into
 * shallow horizontal depth bands lets characters naturally pass in front of,
 * or behind, furniture while preserving every foreground pixel.
 */
export const OCCLUSION_BANDS:OcclusionBand[]=Array.from(
  {length:Math.ceil(OFFICE_HEIGHT/OCCLUSION_BAND_HEIGHT)},
  (_,index)=>{
    const y=index*OCCLUSION_BAND_HEIGHT;
    const height=Math.min(OCCLUSION_BAND_HEIGHT,OFFICE_HEIGHT-y);
    return{id:`foreground-band-${index}`,x:0,y,width:OFFICE_WIDTH,height,sortY:y+height-2};
  }
);
