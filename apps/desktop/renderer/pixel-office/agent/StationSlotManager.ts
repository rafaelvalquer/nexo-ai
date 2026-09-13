import type { OfficeStationId } from "@nexo/shared";
import { OFFICE_STATIONS,type WorldPoint } from "../data/office-layout";

const key=(point:WorldPoint)=>`${point.x}:${point.y}`;

export class StationSlotManager{
  private reservations=new Map<OfficeStationId,Map<string,WorldPoint>>();

  reserve(stationId:OfficeStationId,agentId:string):WorldPoint{
    const station=OFFICE_STATIONS[stationId];
    let stationMap=this.reservations.get(stationId);
    if(!stationMap){stationMap=new Map();this.reservations.set(stationId,stationMap);}
    const existing=stationMap.get(agentId);
    if(existing)return existing;
    const used=new Set([...stationMap.values()].map(key));
    const fallbackIndex=Math.max(0,Math.min(station.slots.length-1,(Number(agentId.match(/(\d+)$/)?.[1])||1)-1));
    const slot=station.slots.find(candidate=>!used.has(key(candidate)))??station.slots[fallbackIndex]??{x:station.x,y:station.y};
    stationMap.set(agentId,slot);
    return slot;
  }

  release(agentId:string,stationId?:OfficeStationId){
    if(stationId){this.reservations.get(stationId)?.delete(agentId);return;}
    for(const map of this.reservations.values())map.delete(agentId);
  }

  moveReservation(agentId:string,from:OfficeStationId,to:OfficeStationId){
    if(from!==to)this.release(agentId,from);
    return this.reserve(to,agentId);
  }

  snapshot(){
    return Object.fromEntries([...this.reservations].map(([station,map])=>[
      station,[...map].map(([agent,point])=>({agent,...point}))
    ]));
  }
}
