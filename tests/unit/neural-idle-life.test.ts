import {describe,expect,it} from "vitest";
import {createSeededRandom} from "../../apps/desktop/renderer/components/ai/neural/neuralGeometry";
import {createIdleLife} from "../../apps/desktop/renderer/components/ai/neural/neuralIdleLife";

function snapshot(engine:ReturnType<typeof createIdleLife>){
  const state=engine.state;
  return {
    activity:Number(state.activity.toFixed(6)),
    focusRegion:state.focusRegion,
    focusIntensity:Number(state.focusIntensity.toFixed(6)),
    burst:Number(state.burst.toFixed(6)),
    shimmer:Number(state.shimmer.toFixed(6)),
    wave:Number(state.wave.toFixed(6)),
    cascade:Number(state.cascade.toFixed(6)),
    rotationBiasX:Number(state.rotationBiasX.toFixed(6)),
    rotationBiasY:Number(state.rotationBiasY.toFixed(6)),
    rotationBiasZ:Number(state.rotationBiasZ.toFixed(6)),
    waveOrigin:state.waveOrigin.map(value=>Number(value.toFixed(6))),
    lastEvent:state.lastEvent
  };
}

describe("Neural Core Idle Life",()=>{
  it("gera atividade espontânea determinística com seed fixa",()=>{
    const first=createIdleLife(createSeededRandom("idle-life-test"));
    const second=createIdleLife(createSeededRandom("idle-life-test"));
    for(let step=0;step<=300;step++){
      const time=step*.1;
      first.update(time,.1,true,.65);
      second.update(time,.1,true,.65);
    }
    expect(snapshot(first)).toEqual(snapshot(second));
    expect(first.state.lastEvent).not.toBeNull();
    expect(first.state.focusRegion).toBeGreaterThanOrEqual(-1);
    expect(first.state.focusRegion).toBeLessThanOrEqual(5);
    expect(first.state.activity).toBeGreaterThanOrEqual(.84);
    expect(first.state.activity).toBeLessThanOrEqual(1);
  });

  it("não dispara eventos enquanto está desabilitado ou pausado",()=>{
    const engine=createIdleLife(createSeededRandom("idle-life-paused"));
    for(let step=0;step<=200;step++)engine.update(step*.1,0,false,.65);
    expect(engine.state.lastEvent).toBeNull();
    expect(engine.state.burst).toBe(0);
    expect(engine.state.wave).toBe(0);
    expect(engine.state.cascade).toBe(0);
  });

  it("mantém todos os valores numéricos finitos durante uma janela longa",()=>{
    const engine=createIdleLife(createSeededRandom("idle-life-finite"));
    for(let step=0;step<=600;step++){
      engine.update(step/30,1/30,true,.65);
      const state=engine.state;
      for(const value of [state.activity,state.focusIntensity,state.burst,state.shimmer,state.wave,state.cascade,state.rotationBiasX,state.rotationBiasY,state.rotationBiasZ,...state.waveOrigin]){
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });
});
