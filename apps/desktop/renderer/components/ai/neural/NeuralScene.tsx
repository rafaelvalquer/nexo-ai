import { useEffect, useRef } from "react";
import { buildAdjacencyMap, generateNeuralEdges } from "./neuralConnections";
import { createSeededRandom, generateAmbientParticles, generateNeuralNodes, NEURAL_SEED } from "./neuralGeometry";
import { decayInteraction } from "./neuralInteraction";
import { exponentialApproach, hexColor } from "./neuralPhysics";
import { getTargetFrameInterval, lowerNeuralQuality, neuralQualityProfiles } from "./neuralPerformance";
import { neuralStates } from "./neuralStates";
import { ambientFragmentShader, ambientVertexShader, edgeFragmentShader, edgeVertexShader, nodeFragmentShader, nodeVertexShader, pulseFragmentShader, pulseVertexShader } from "./neuralShaders";
import type { NeuralEdge, NeuralSceneProps, SynapticPulse } from "./types";

type ProgramInfo = {
  program: WebGLProgram;
  attributes: Record<string, number>;
  uniforms: Record<string, WebGLUniformLocation | null>;
};

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Não foi possível criar o shader do Neural Core.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Shader inválido.";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vertex: string, fragment: string, attributes: string[], uniforms: string[]): ProgramInfo {
  const program = gl.createProgram();
  if (!program) throw new Error("Não foi possível criar o programa do Neural Core.");
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertex);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "Programa WebGL inválido.";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return {
    program,
    attributes: Object.fromEntries(attributes.map(name => [name, gl.getAttribLocation(program, name)])),
    uniforms: Object.fromEntries(uniforms.map(name => [name, gl.getUniformLocation(program, name)]))
  };
}

const identity = () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
function multiply(a: Float32Array, b: Float32Array) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) {
    out[column * 4 + row] = a[row] * b[column * 4] + a[4 + row] * b[column * 4 + 1] + a[8 + row] * b[column * 4 + 2] + a[12 + row] * b[column * 4 + 3];
  }
  return out;
}
function rotateX(angle: number) { const c=Math.cos(angle),s=Math.sin(angle); return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]); }
function rotateY(angle: number) { const c=Math.cos(angle),s=Math.sin(angle); return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]); }
function rotateZ(angle: number) { const c=Math.cos(angle),s=Math.sin(angle); return new Float32Array([c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]); }
function scaleMatrix(value: number) { return new Float32Array([value,0,0,0, 0,value,0,0, 0,0,value,0, 0,0,0,1]); }
function translation(z: number) { const matrix=identity(); matrix[14]=z; return matrix; }
function perspective(fov: number, aspect: number, near: number, far: number) {
  const f=1/Math.tan(fov/2), range=1/(near-far);
  return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(near+far)*range,-1, 0,0,2*near*far*range,0]);
}

function bindAttribute(gl: WebGLRenderingContext, program: ProgramInfo, name: string, buffer: WebGLBuffer, size: number) {
  const location = program.attributes[name];
  if (location === undefined || location < 0) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
}
function setMatrix(gl: WebGLRenderingContext, program: ProgramInfo, name: string, value: Float32Array) {
  const location = program.uniforms[name]; if (location) gl.uniformMatrix4fv(location, false, value);
}
function setFloat(gl: WebGLRenderingContext, program: ProgramInfo, name: string, value: number) {
  const location = program.uniforms[name]; if (location) gl.uniform1f(location, value);
}
function setVec2(gl: WebGLRenderingContext, program: ProgramInfo, name: string, x: number, y: number) {
  const location = program.uniforms[name]; if (location) gl.uniform2f(location, x, y);
}
function setColor(gl: WebGLRenderingContext, program: ProgramInfo, name: string, value: number[]) {
  const location = program.uniforms[name]; if (location) gl.uniform3fv(location, value);
}

function flattenNodes(nodes: ReturnType<typeof generateNeuralNodes>) {
  const positions=new Float32Array(nodes.length*3), phases=new Float32Array(nodes.length), weights=new Float32Array(nodes.length), regions=new Float32Array(nodes.length);
  nodes.forEach((node,index)=>{
    positions.set(node.position,index*3); phases[index]=node.phase; weights[index]=node.weight; regions[index]=node.region;
  });
  return {positions,phases,weights,regions};
}

function flattenEdges(nodes: ReturnType<typeof generateNeuralNodes>, edges: NeuralEdge[]) {
  const count=edges.length*2, positions=new Float32Array(count*3), phases=new Float32Array(count), weights=new Float32Array(count), regions=new Float32Array(count);
  edges.forEach((edge,index)=>{
    const a=nodes[edge.source],b=nodes[edge.target],offset=index*6,vertex=index*2;
    positions.set(a.position,offset); positions.set(b.position,offset+3);
    phases[vertex]=a.phase+edge.phase*.15; phases[vertex+1]=b.phase+edge.phase*.15;
    weights[vertex]=weights[vertex+1]=edge.weight;
    regions[vertex]=a.region; regions[vertex+1]=b.region;
  });
  return {positions,phases,weights,regions};
}

function flattenAmbient(particles: ReturnType<typeof generateAmbientParticles>) {
  const positions=new Float32Array(particles.length*3), phases=new Float32Array(particles.length), sizes=new Float32Array(particles.length);
  particles.forEach((particle,index)=>{positions.set(particle.position,index*3);phases[index]=particle.phase;sizes[index]=particle.size;});
  return {positions,phases,sizes};
}

function nodeRadius(position: [number,number,number]) { return Math.hypot(position[0],position[1],position[2]); }

export function NeuralScene({state,interaction,paused,quality,onUnavailable,onQualityChange}: NeuralSceneProps) {
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const propsRef=useRef({state,paused,onUnavailable,onQualityChange});
  const redrawRef=useRef<(()=>void)|undefined>(undefined);
  propsRef.current={state,paused,onUnavailable,onQualityChange};

  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas) return;
    const gl=canvas.getContext("webgl",{alpha:true,antialias:true,powerPreference:"low-power",premultipliedAlpha:true});
    if(!gl){propsRef.current.onUnavailable();return;}

    const buffers:WebGLBuffer[]=[], programs:WebGLProgram[]=[];
    let animationFrame=0, resizeObserver:ResizeObserver|undefined, elapsed=0, lastFrame=0, lastDraw=0, failed=false, documentVisible=!document.hidden;
    let currentPrimary=[.46,.36,1],currentSecondary=[.29,.84,1], currentNodeIntensity=.55,currentConnectionIntensity=.18,currentMotion=.35,currentSpread=0;
    let performanceStart=0, performanceFrames=0, qualityReported=false;
    const random=createSeededRandom(`${NEURAL_SEED}_PULSES`);
    const profile=neuralQualityProfiles[quality];
    const nodes=generateNeuralNodes(profile.nodeCount);
    const edges=generateNeuralEdges(nodes,profile.maxConnections);
    const adjacency=buildAdjacencyMap(edges,nodes.length);
    const ambient=generateAmbientParticles(profile.particleCount);
    const nodeData=flattenNodes(nodes),edgeData=flattenEdges(nodes,edges),ambientData=flattenAmbient(ambient);
    const pulses:SynapticPulse[]=Array.from({length:profile.maxPulses},(_,index)=>({edgeIndex:index%Math.max(1,edges.length),progress:random(),speed:.45+random()*.55,intensity:.55+random()*.45,reverse:random()>.5}));
    const pulsePositions=new Float32Array(profile.maxPulses*3),pulseIntensities=new Float32Array(profile.maxPulses);

    const fail=()=>{if(failed)return;failed=true;propsRef.current.onUnavailable();};
    const makeBuffer=(data:BufferSource,usage:number=gl.STATIC_DRAW)=>{const buffer=gl.createBuffer();if(!buffer)throw new Error("Buffer WebGL indisponível.");buffers.push(buffer);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,usage);return buffer;};

    try{
      const commonUniforms=["uMvp","uModelView","uTime","uPointer","uPointerStrength","uPointerSpeed","uSpread","uMotionSpeed","uWave","uActiveRegion","uPrimary","uSecondary","uDpr","uNodeIntensity","uConnectionIntensity"];
      const nodeProgram=createProgram(gl,nodeVertexShader,nodeFragmentShader,["aPosition","aPhase","aWeight","aRegion"],commonUniforms);
      const edgeProgram=createProgram(gl,edgeVertexShader,edgeFragmentShader,["aPosition","aPhase","aWeight","aRegion"],commonUniforms);
      const pulseProgram=createProgram(gl,pulseVertexShader,pulseFragmentShader,["aPosition","aIntensity"],commonUniforms);
      const ambientProgram=createProgram(gl,ambientVertexShader,ambientFragmentShader,["aPosition","aPhase","aSize"],commonUniforms);
      programs.push(nodeProgram.program,edgeProgram.program,pulseProgram.program,ambientProgram.program);

      const nodePositionBuffer=makeBuffer(nodeData.positions),nodePhaseBuffer=makeBuffer(nodeData.phases),nodeWeightBuffer=makeBuffer(nodeData.weights),nodeRegionBuffer=makeBuffer(nodeData.regions);
      const edgePositionBuffer=makeBuffer(edgeData.positions),edgePhaseBuffer=makeBuffer(edgeData.phases),edgeWeightBuffer=makeBuffer(edgeData.weights),edgeRegionBuffer=makeBuffer(edgeData.regions);
      const ambientPositionBuffer=makeBuffer(ambientData.positions),ambientPhaseBuffer=makeBuffer(ambientData.phases),ambientSizeBuffer=makeBuffer(ambientData.sizes);
      const pulsePositionBuffer=makeBuffer(pulsePositions,gl.DYNAMIC_DRAW),pulseIntensityBuffer=makeBuffer(pulseIntensities,gl.DYNAMIC_DRAW);
      const view=translation(-5.1);
      let width=1,height=1,dpr=1;

      const resize=()=>{
        const rect=canvas.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);dpr=Math.min(globalThis.devicePixelRatio||1,profile.dpr);
        const pixelWidth=Math.max(1,Math.round(width*dpr)),pixelHeight=Math.max(1,Math.round(height*dpr));
        if(canvas.width!==pixelWidth||canvas.height!==pixelHeight){canvas.width=pixelWidth;canvas.height=pixelHeight;gl.viewport(0,0,pixelWidth,pixelHeight);}
      };

      const recyclePulse=(pulse:SynapticPulse,stateName:typeof state)=>{
        const currentEdge=edges[pulse.edgeIndex];
        const endpoint=pulse.reverse?currentEdge.source:currentEdge.target;
        let candidates=adjacency[endpoint]??[];
        if(stateName==="interpreting"||stateName==="responding"){
          const currentRadius=nodeRadius(nodes[endpoint].position);
          const preferred=candidates.filter(edgeIndex=>{
            const edge=edges[edgeIndex],other=edge.source===endpoint?edge.target:edge.source,otherRadius=nodeRadius(nodes[other].position);
            return stateName==="interpreting"?otherRadius<currentRadius:otherRadius>currentRadius;
          });
          if(preferred.length)candidates=preferred;
        }
        const nextIndex=candidates.length?candidates[Math.floor(random()*candidates.length)]:Math.floor(random()*edges.length);
        const next=edges[nextIndex];
        pulse.edgeIndex=nextIndex;
        pulse.reverse=next.target===endpoint;
        pulse.progress=0;
        pulse.speed=.72+random()*.55;
        pulse.intensity=.62+random()*.38;
      };

      const updatePulses=(delta:number,activeCount:number,pulseSpeed:number,stateName:typeof state)=>{
        const count=Math.min(activeCount,pulses.length);
        for(let index=0;index<count;index++){
          const pulse=pulses[index];
          pulse.progress+=delta*pulse.speed*pulseSpeed;
          if(pulse.progress>=1)recyclePulse(pulse,stateName);
          const edge=edges[pulse.edgeIndex],source=nodes[pulse.reverse?edge.target:edge.source].position,target=nodes[pulse.reverse?edge.source:edge.target].position,t=pulse.progress;
          pulsePositions[index*3]=source[0]+(target[0]-source[0])*t;
          pulsePositions[index*3+1]=source[1]+(target[1]-source[1])*t;
          pulsePositions[index*3+2]=source[2]+(target[2]-source[2])*t;
          pulseIntensities[index]=pulse.intensity;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER,pulsePositionBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,pulsePositions.subarray(0,count*3));
        gl.bindBuffer(gl.ARRAY_BUFFER,pulseIntensityBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,pulseIntensities.subarray(0,count));
        return count;
      };

      const setShared=(program:ProgramInfo,mvp:Float32Array,modelView:Float32Array,primary:number[],secondary:number[],activeRegion:number,wave:number)=>{
        setMatrix(gl,program,"uMvp",mvp);setMatrix(gl,program,"uModelView",modelView);setFloat(gl,program,"uTime",elapsed);
        setVec2(gl,program,"uPointer",interaction.current.x,-interaction.current.y);setFloat(gl,program,"uPointerStrength",interaction.current.hovering?neuralStates[propsRef.current.state].interactionStrength:0);
        setFloat(gl,program,"uPointerSpeed",Math.min(1,interaction.current.speed*7));setFloat(gl,program,"uSpread",currentSpread+(interaction.current.expanded ? .11 : 0));setFloat(gl,program,"uMotionSpeed",currentMotion);
        setFloat(gl,program,"uWave",wave);setFloat(gl,program,"uActiveRegion",activeRegion);setColor(gl,program,"uPrimary",primary);setColor(gl,program,"uSecondary",secondary);setFloat(gl,program,"uDpr",dpr);
        setFloat(gl,program,"uNodeIntensity",currentNodeIntensity);setFloat(gl,program,"uConnectionIntensity",currentConnectionIntensity);
      };

      const draw=(now:number)=>{
        if(failed||!documentVisible)return;
        resize();
        const props=propsRef.current;
        const delta=lastFrame?Math.min((now-lastFrame)/1000,.05):0;lastFrame=now;
        decayInteraction(interaction.current,delta);
        if(!props.paused)elapsed+=delta;
        const stateConfig=neuralStates[props.state],targetPrimary=hexColor(stateConfig.primary),targetSecondary=hexColor(stateConfig.secondary),mix=1-Math.exp(-delta*4);
        for(let channel=0;channel<3;channel++){currentPrimary[channel]+=(targetPrimary[channel]-currentPrimary[channel])*mix;currentSecondary[channel]+=(targetSecondary[channel]-currentSecondary[channel])*mix;}
        currentNodeIntensity=exponentialApproach(currentNodeIntensity,stateConfig.nodeIntensity,delta,4);
        currentConnectionIntensity=exponentialApproach(currentConnectionIntensity,stateConfig.connectionIntensity,delta,4);
        currentMotion=exponentialApproach(currentMotion,stateConfig.motionSpeed,delta,3.5);
        currentSpread=exponentialApproach(currentSpread,stateConfig.spread,delta,4);

        const pointerX=interaction.current.x,pointerY=interaction.current.y;
        const errorJitter=props.state==="error"?Math.sin(elapsed*37)*.009:0;
        const model=multiply(multiply(multiply(rotateZ(-.035+errorJitter),rotateY(pointerX*.13)),rotateX(-pointerY*.10)),scaleMatrix(1.02));
        const modelView=multiply(view,model),projection=perspective(40*Math.PI/180,width/height,.1,100),mvp=multiply(projection,modelView);
        const activeRegion=interaction.current.activeRegion>=0?interaction.current.activeRegion:props.state==="planning"?Math.floor(elapsed*.78)%6:props.state==="awaiting-approval"?0:-1;
        const wave=Math.min(1,interaction.current.wave+(props.state==="success"?.34:props.state==="error"?.18:0));

        gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.BLEND);gl.depthMask(false);

        gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(ambientProgram.program);setShared(ambientProgram,mvp,modelView,currentPrimary,currentSecondary,activeRegion,wave);
        bindAttribute(gl,ambientProgram,"aPosition",ambientPositionBuffer,3);bindAttribute(gl,ambientProgram,"aPhase",ambientPhaseBuffer,1);bindAttribute(gl,ambientProgram,"aSize",ambientSizeBuffer,1);gl.drawArrays(gl.POINTS,0,ambient.length);

        gl.useProgram(edgeProgram.program);setShared(edgeProgram,mvp,modelView,currentPrimary,currentSecondary,activeRegion,wave);
        bindAttribute(gl,edgeProgram,"aPosition",edgePositionBuffer,3);bindAttribute(gl,edgeProgram,"aPhase",edgePhaseBuffer,1);bindAttribute(gl,edgeProgram,"aWeight",edgeWeightBuffer,1);bindAttribute(gl,edgeProgram,"aRegion",edgeRegionBuffer,1);gl.drawArrays(gl.LINES,0,edges.length*2);

        gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
        gl.useProgram(nodeProgram.program);setShared(nodeProgram,mvp,modelView,currentPrimary,currentSecondary,activeRegion,wave);
        bindAttribute(gl,nodeProgram,"aPosition",nodePositionBuffer,3);bindAttribute(gl,nodeProgram,"aPhase",nodePhaseBuffer,1);bindAttribute(gl,nodeProgram,"aWeight",nodeWeightBuffer,1);bindAttribute(gl,nodeProgram,"aRegion",nodeRegionBuffer,1);gl.drawArrays(gl.POINTS,0,nodes.length);

        const pulseCount=updatePulses(props.paused?0:delta,Math.min(stateConfig.pulseCount,profile.maxPulses),stateConfig.pulseSpeed,props.state);
        if(pulseCount>0){gl.useProgram(pulseProgram.program);setShared(pulseProgram,mvp,modelView,currentPrimary,currentSecondary,activeRegion,wave);bindAttribute(gl,pulseProgram,"aPosition",pulsePositionBuffer,3);bindAttribute(gl,pulseProgram,"aIntensity",pulseIntensityBuffer,1);gl.drawArrays(gl.POINTS,0,pulseCount);}
        gl.depthMask(true);

        if(!props.paused&&getTargetFrameInterval(props.state,interaction.current.hovering,true)<=17){
          if(!performanceStart)performanceStart=now;
          performanceFrames++;
          if(now-performanceStart>=3000&&!qualityReported){
            const fps=performanceFrames/((now-performanceStart)/1000);
            if(fps<45&&quality!=="low"){qualityReported=true;props.onQualityChange?.(lowerNeuralQuality(quality));}
            performanceStart=now;performanceFrames=0;
          }
        }else{performanceStart=0;performanceFrames=0;}
      };

      const schedule=()=>{
        if(failed||!documentVisible)return;
        if(animationFrame)cancelAnimationFrame(animationFrame);
        animationFrame=requestAnimationFrame(function frame(now){
          animationFrame=0;
          const interval=getTargetFrameInterval(propsRef.current.state,interaction.current.hovering,true);
          if(!lastDraw||now-lastDraw>=interval-1){draw(now);lastDraw=now;}
          if(!propsRef.current.paused&&documentVisible)animationFrame=requestAnimationFrame(frame);
        });
      };

      redrawRef.current=schedule;
      resizeObserver=new ResizeObserver(()=>schedule());resizeObserver.observe(canvas);
      const contextLost=(event:Event)=>{event.preventDefault();fail();};canvas.addEventListener("webglcontextlost",contextLost);
      const visibility=()=>{documentVisible=!document.hidden;if(documentVisible){lastFrame=0;lastDraw=0;schedule();}else if(animationFrame){cancelAnimationFrame(animationFrame);animationFrame=0;}};
      document.addEventListener("visibilitychange",visibility);
      schedule();
      return()=>{
        canvas.removeEventListener("webglcontextlost",contextLost);document.removeEventListener("visibilitychange",visibility);resizeObserver?.disconnect();
        if(animationFrame)cancelAnimationFrame(animationFrame);redrawRef.current=undefined;
        buffers.forEach(buffer=>gl.deleteBuffer(buffer));programs.forEach(program=>gl.deleteProgram(program));
      };
    }catch{
      fail();buffers.forEach(buffer=>gl.deleteBuffer(buffer));programs.forEach(program=>gl.deleteProgram(program));
    }
  },[interaction,quality]);

  useEffect(()=>{redrawRef.current?.();},[state,paused]);
  return <canvas ref={canvasRef} className="neuralCoreCanvas nucleusCanvas" aria-hidden="true" data-quality={quality}/>;
}
