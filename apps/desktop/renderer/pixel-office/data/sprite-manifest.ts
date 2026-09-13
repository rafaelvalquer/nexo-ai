export type OctopusAnimation=
  "idle"|"walkUp"|"walkDown"|"walkLeft"|"walkRight"|
  "working"|"thinking"|"planning"|"reading"|"mailing"|"browsing"|"system"|
  "approval"|"responding"|"success"|"error"|"cancelled"|"offline";

export const OCTOPUS_SPRITE={
  columns:4,
  rows:4,
  imageWidth:1263,
  imageHeight:1245,
  frameColumns:[0,316,632,947,1263],
  frameRows:[0,311,623,934,1245],
  animations:{
    idle:[0,1,2,1,0,3],
    walkDown:[4,5,6,5,4,7],
    walkLeft:[5,6,5,4,5,7],
    walkRight:[6,7,6,4,6,5],
    walkUp:[7,4,7,5,7,6],
    working:[8,9,8,11,9,8],
    thinking:[10,11,10,11,10,9],
    planning:[10,11,9,10,11,8],
    reading:[8,10,9,10,8,11],
    mailing:[9,8,11,9,8,10],
    browsing:[8,9,11,8,10,9],
    system:[11,8,9,11,10,8],
    approval:[11,10,11,10,9,11],
    responding:[8,9,11,9,8,11],
    success:[12,13,12,13,12,15],
    error:[14,13,14,13,14,15],
    cancelled:[14,15,14,15],
    offline:[15,14,15,14]
  } satisfies Record<OctopusAnimation,number[]>
};
