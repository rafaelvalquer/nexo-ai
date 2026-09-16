import { addMinutes,resolveDateTime,resolvePeriod,type ResolvedPeriod } from "../orchestrator/temporal-resolver.js";

export type TemporalContext={now:string;timeZone:string;today:string;tomorrow:string;dayAfterTomorrow:string;weekStart:string;locale:"pt-BR"};

export class DateTimeResolver{
  constructor(private readonly timeZone="America/Sao_Paulo",private readonly clock=()=>new Date()){}
  context(now=this.clock()):TemporalContext{
    const date=(days:number)=>{const copy=new Date(now);copy.setDate(copy.getDate()+days);return copy.toLocaleDateString("en-CA",{timeZone:this.timeZone});};
    const weekday=new Date(now);const delta=(weekday.getDay()+6)%7;weekday.setDate(weekday.getDate()-delta);
    return{now:now.toISOString(),timeZone:this.timeZone,today:date(0),tomorrow:date(1),dayAfterTomorrow:date(2),weekStart:weekday.toLocaleDateString("en-CA",{timeZone:this.timeZone}),locale:"pt-BR"};
  }
  resolvePeriod(value:unknown,dayPart?:unknown,now=this.clock()):ResolvedPeriod{return resolvePeriod(value,now,dayPart);}
  resolveDateTime(period:unknown,time:unknown,now=this.clock()){return resolveDateTime(period,time,now);}
  resolveEnd(start:string,durationMinutes=60){return addMinutes(start,durationMinutes);}
}
