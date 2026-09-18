import { useEffect, useRef, type MutableRefObject } from "react";
import type { AgentVisualState } from "../../../design/tokens";
import { orbColors } from "./states";
import { noise } from "./shaders";

export type OrbInteraction = { x: number; y: number; expanded: boolean };
type Props = { state: AgentVisualState; interaction: MutableRefObject<OrbInteraction>; paused: boolean; onUnavailable: () => void };
type ProgramInfo = { program: WebGLProgram; attributes: Record<string, number>; uniforms: Record<string, WebGLUniformLocation | null> };
type Ring = { buffer: WebGLBuffer; node: WebGLBuffer; radius: number; tilt: number; spin: number; color: number[]; alpha: number };

const coreVertex = `
attribute vec3 aPosition;
attribute vec3 aNormal;
uniform mat4 uMvp;
uniform mat4 uModelView;
uniform float uTime;
varying vec3 vSurface;
varying vec3 vNormal;
varying vec3 vEye;
${noise}
void main(){
  vSurface=aPosition;
  vec3 displaced=aPosition+aNormal*(field(aPosition*3.0+uTime*0.12)-0.45)*0.09;
  vec4 view=uModelView*vec4(displaced,1.0);
  vNormal=normalize(mat3(uModelView)*aNormal);
  vEye=normalize(-view.xyz);
  gl_Position=uMvp*vec4(displaced,1.0);
}`;

const coreFragment = `
precision highp float;
uniform float uTime;
uniform vec3 uPrimary;
uniform vec3 uSecondary;
varying vec3 vSurface;
varying vec3 vNormal;
varying vec3 vEye;
${noise}
void main(){
  vec3 p=vSurface;
  float flow=field(p*2.9+vec3(uTime*0.08,-uTime*0.1,uTime*0.04));
  float ribbons=pow(0.5+0.5*sin((p.y+p.x*0.5+flow*1.8)*34.0-uTime*0.65),14.0);
  float fine=pow(0.5+0.5*sin((p.y-flow*0.6+p.z*0.2)*92.0+uTime*0.2),24.0);
  float facing=max(0.0,dot(normalize(vNormal),normalize(vEye)));
  float rim=pow(1.0-facing,2.5);
  float light=pow(max(0.0,dot(normalize(vNormal),normalize(vec3(-0.7,0.9,1.0)))),12.0);
  vec3 color=mix(vec3(0.015,0.028,0.065),uPrimary*0.19,flow);
  color+=mix(uPrimary,uSecondary,smoothstep(-0.7,0.6,p.x+p.y*0.6))*(ribbons*0.82+fine*0.16+rim*0.72);
  color+=vec3(0.63,0.9,1.0)*light*0.38;
  color*=0.55+facing*0.45;
  gl_FragColor=vec4(color,1.0);
}`;

const lineVertex = `
attribute vec3 aPosition;
uniform mat4 uMvp;
uniform float uPointSize;
void main(){gl_Position=uMvp*vec4(aPosition,1.0);gl_PointSize=uPointSize;}`;
const lineFragment = `
precision mediump float;
uniform vec4 uColor;
void main(){gl_FragColor=uColor;}`;
const particleVertex = `
attribute vec3 aPosition;
attribute float aSeed;
uniform mat4 uMvp;
uniform mat4 uModelView;
uniform float uTime;
uniform float uSpread;
uniform float uDpr;
varying float vBrightness;
void main(){
  vec3 p=aPosition*(1.0+uSpread*0.15);
  p+=normalize(aPosition)*sin(uTime*0.5+aSeed*30.0)*0.06;
  vBrightness=0.3+0.7*(0.5+0.5*sin(aSeed*21.0+uTime*0.8));
  vec4 view=uModelView*vec4(p,1.0);
  gl_Position=uMvp*vec4(p,1.0);
  gl_PointSize=(1.5+aSeed*2.0)*min(2.0,5.0/max(0.1,-view.z))*uDpr;
}`;
const particleFragment = `
precision mediump float;
uniform vec3 uColor;
varying float vBrightness;
void main(){float radius=length(gl_PointCoord-0.5)*2.0;if(radius>1.0)discard;gl_FragColor=vec4(uColor,(1.0-radius)*vBrightness*0.8);}`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Não foi possível criar o shader do núcleo visual.");
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
  if (!program) throw new Error("Não foi possível criar o programa do núcleo visual.");
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertex);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "Programa gráfico inválido.";
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
  for (let column=0;column<4;column++) for (let row=0;row<4;row++) {
    out[column*4+row]=a[row]*b[column*4]+a[4+row]*b[column*4+1]+a[8+row]*b[column*4+2]+a[12+row]*b[column*4+3];
  }
  return out;
}
function rotateX(angle: number) { const c=Math.cos(angle),s=Math.sin(angle);return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]); }
function rotateY(angle: number) { const c=Math.cos(angle),s=Math.sin(angle);return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]); }
function rotateZ(angle: number) { const c=Math.cos(angle),s=Math.sin(angle);return new Float32Array([c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]); }
function scaleMatrix(value: number) { return new Float32Array([value,0,0,0, 0,value,0,0, 0,0,value,0, 0,0,0,1]); }
function translation(z: number) { const matrix=identity();matrix[14]=z;return matrix; }
function perspective(fov: number, aspect: number, near: number, far: number) {
  const f=1/Math.tan(fov/2),range=1/(near-far);
  return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(near+far)*range,-1, 0,0,2*near*far*range,0]);
}
function hexColor(hex: string) { const value=Number.parseInt(hex.slice(1),16);return [(value>>16&255)/255,(value>>8&255)/255,(value&255)/255]; }
function createBuffer(gl: WebGLRenderingContext, data: BufferSource, target: number=gl.ARRAY_BUFFER) {
  const buffer=gl.createBuffer();if(!buffer)throw new Error("Não foi possível criar o buffer do núcleo visual.");
  gl.bindBuffer(target,buffer);gl.bufferData(target,data,gl.STATIC_DRAW);return buffer;
}
function sphereGeometry(latitudeBands: number, longitudeBands: number) {
  const positions:number[]=[],normals:number[]=[],indices:number[]=[];
  for(let latitude=0;latitude<=latitudeBands;latitude++){
    const theta=latitude*Math.PI/latitudeBands,sinTheta=Math.sin(theta),cosTheta=Math.cos(theta);
    for(let longitude=0;longitude<=longitudeBands;longitude++){
      const phi=longitude*2*Math.PI/longitudeBands,x=Math.cos(phi)*sinTheta,y=cosTheta,z=Math.sin(phi)*sinTheta;
      positions.push(x*.96,y*.96,z*.96);normals.push(x,y,z);
    }
  }
  for(let latitude=0;latitude<latitudeBands;latitude++)for(let longitude=0;longitude<longitudeBands;longitude++){
    const first=latitude*(longitudeBands+1)+longitude,second=first+longitudeBands+1;
    indices.push(first,second,first+1,second,second+1,first+1);
  }
  return{positions:new Float32Array(positions),normals:new Float32Array(normals),indices:new Uint16Array(indices)};
}
function orbitGeometry(radius: number) {
  const vertices:number[]=[];const arc=Math.PI*1.85;
  for(let index=0;index<=160;index++){const angle=arc*index/160;vertices.push(Math.cos(angle)*radius,Math.sin(angle)*radius,0);}
  return new Float32Array(vertices);
}
function particleGeometry() {
  const count=520,positions=new Float32Array(count*3),seeds=new Float32Array(count);
  for(let index=0;index<count;index++){
    const seed=(index*7919%997)/997,y=1-2*(index+.5)/count,angle=index*2.399963,radius=1.5+seed*.65,ring=Math.sqrt(1-y*y);
    positions.set([Math.cos(angle)*ring*radius,y*radius*.78,Math.sin(angle)*ring*radius],index*3);seeds[index]=seed;
  }
  return{positions,seeds};
}
function bindAttribute(gl: WebGLRenderingContext, program: ProgramInfo, name: string, buffer: WebGLBuffer, size: number) {
  const location=program.attributes[name];if(location<0)return;
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);
}
function setMatrix(gl: WebGLRenderingContext, program: ProgramInfo, name: string, value: Float32Array) { const location=program.uniforms[name];if(location)gl.uniformMatrix4fv(location,false,value); }
function setFloat(gl: WebGLRenderingContext, program: ProgramInfo, name: string, value: number) { const location=program.uniforms[name];if(location)gl.uniform1f(location,value); }
function setColor(gl: WebGLRenderingContext, program: ProgramInfo, name: string, value: number[]) { const location=program.uniforms[name];if(location)gl.uniform3fv(location,value); }

export function OrbScene({state,interaction,paused,onUnavailable}:Props) {
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const propsRef=useRef({state,paused,onUnavailable});
  const redrawRef=useRef<(()=>void)|undefined>(undefined);
  propsRef.current={state,paused,onUnavailable};

  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const gl=canvas.getContext("webgl",{alpha:true,antialias:true,powerPreference:"low-power",premultipliedAlpha:true});
    if(!gl){propsRef.current.onUnavailable();return;}
    const buffers:WebGLBuffer[]=[],programs:WebGLProgram[]=[];
    let animationFrame=0,observer:ResizeObserver|undefined,elapsed=0,lastFrame=0,failed=false,visible=!document.hidden;
    const fail=()=>{if(failed)return;failed=true;propsRef.current.onUnavailable();};
    const makeBuffer=(data:BufferSource,target:number=gl.ARRAY_BUFFER)=>{const buffer=createBuffer(gl,data,target);buffers.push(buffer);return buffer;};
    try{
      const core=createProgram(gl,coreVertex,coreFragment,["aPosition","aNormal"],["uMvp","uModelView","uTime","uPrimary","uSecondary"]);
      const lines=createProgram(gl,lineVertex,lineFragment,["aPosition"],["uMvp","uColor","uPointSize"]);
      const particlesProgram=createProgram(gl,particleVertex,particleFragment,["aPosition","aSeed"],["uMvp","uModelView","uTime","uSpread","uDpr","uColor"]);
      programs.push(core.program,lines.program,particlesProgram.program);
      const sphere=sphereGeometry(40,48);
      const spherePositions=makeBuffer(sphere.positions),sphereNormals=makeBuffer(sphere.normals),sphereIndices=makeBuffer(sphere.indices,gl.ELEMENT_ARRAY_BUFFER);
      const particles=particleGeometry(),particlePositions=makeBuffer(particles.positions),particleSeeds=makeBuffer(particles.seeds);
      const rings:Ring[]=[{radius:1.35,tilt:1.08,spin:.2,color:[0,0,0],alpha:.5},{radius:1.52,tilt:-.75,spin:-.45,color:[0,0,0],alpha:.41},{radius:1.75,tilt:1.42,spin:.5,color:[0,0,0],alpha:.32}].map(ring=>({ ...ring,buffer:makeBuffer(orbitGeometry(ring.radius)),node:makeBuffer(new Float32Array([ring.radius,0,0])) }));
      const view=translation(-5.6),primary=[.59,.45,1],secondary=[.39,.92,.96];
      let width=1,height=1,dpr=1;

      const resize=()=>{
        const rect=canvas.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);dpr=Math.min(globalThis.devicePixelRatio||1,1.25);
        const pixelWidth=Math.max(1,Math.round(width*dpr)),pixelHeight=Math.max(1,Math.round(height*dpr));
        if(canvas.width!==pixelWidth||canvas.height!==pixelHeight){canvas.width=pixelWidth;canvas.height=pixelHeight;gl.viewport(0,0,pixelWidth,pixelHeight);}
      };
      const draw=(now:number)=>{
        if(failed||!visible)return;
        resize();
        const props=propsRef.current,delta=lastFrame?Math.min((now-lastFrame)/1000,.05):0;lastFrame=now;
        if(!props.paused)elapsed+=delta*(props.state==="executing-tool"||props.state==="responding"?1.65:.7);
        const colors=orbColors[props.state],targetPrimary=hexColor(colors.core),targetSecondary=hexColor(colors.ring),amount=1-Math.exp(-delta*4);
        for(let channel=0;channel<3;channel++){primary[channel]+=(targetPrimary[channel]-primary[channel])*amount;secondary[channel]+=(targetSecondary[channel]-secondary[channel])*amount;}
        const targetScale=interaction.current.expanded?1.08:1;
        const model=multiply(multiply(multiply(rotateZ(-.15),rotateY(-.15+interaction.current.x*.4)),rotateX(.12-interaction.current.y*.25)),scaleMatrix(targetScale));
        const modelView=multiply(view,model),projection=perspective(43*Math.PI/180,width/height,.1,100),mvp=multiply(projection,modelView);
        gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);
        gl.useProgram(core.program);bindAttribute(gl,core,"aPosition",spherePositions,3);bindAttribute(gl,core,"aNormal",sphereNormals,3);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,sphereIndices);setMatrix(gl,core,"uMvp",mvp);setMatrix(gl,core,"uModelView",modelView);setFloat(gl,core,"uTime",elapsed);setColor(gl,core,"uPrimary",primary);setColor(gl,core,"uSecondary",secondary);gl.drawElements(gl.TRIANGLES,sphere.indices.length,gl.UNSIGNED_SHORT,0);
        gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);gl.useProgram(lines.program);
        const orbit=multiply(multiply(model,rotateY(elapsed*.06)),rotateZ(Math.sin(elapsed*.12)*.12));
        for(let index=0;index<rings.length;index++){
          const ring=rings[index],ringModel=multiply(multiply(multiply(orbit,rotateX(ring.tilt)),rotateY(ring.spin)),rotateZ(index*.7)),ringMvp=multiply(projection,multiply(view,ringModel)),color=index===1?targetPrimary:targetSecondary;
          bindAttribute(gl,lines,"aPosition",ring.buffer,3);setMatrix(gl,lines,"uMvp",ringMvp);const location=lines.uniforms.uColor;if(location)gl.uniform4f(location,color[0],color[1],color[2],ring.alpha);gl.lineWidth(1);gl.drawArrays(gl.LINE_STRIP,0,161);
          bindAttribute(gl,lines,"aPosition",ring.node,3);const nodeLocation=lines.uniforms.uColor;if(nodeLocation)gl.uniform4f(nodeLocation,.91,.99,1,.95);setFloat(gl,lines,"uPointSize",Math.max(3,4*dpr));gl.drawArrays(gl.POINTS,0,1);
        }
        gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.useProgram(particlesProgram);bindAttribute(gl,particlesProgram,"aPosition",particlePositions,3);bindAttribute(gl,particlesProgram,"aSeed",particleSeeds,1);setMatrix(gl,particlesProgram,"uMvp",mvp);setMatrix(gl,particlesProgram,"uModelView",modelView);setFloat(gl,particlesProgram,"uTime",elapsed);setFloat(gl,particlesProgram,"uSpread",interaction.current.expanded?1:0);setFloat(gl,particlesProgram,"uDpr",dpr);setColor(gl,particlesProgram,"uColor",[.55,.81,.95]);gl.drawArrays(gl.POINTS,0,particles.positions.length/3);
        gl.depthMask(true);
      };
      const schedule=()=>{
        if(failed||!visible)return;
        if(animationFrame)cancelAnimationFrame(animationFrame);
        animationFrame=requestAnimationFrame(function frame(now){animationFrame=0;draw(now);if(!propsRef.current.paused&&visible)animationFrame=requestAnimationFrame(frame);});
      };
      redrawRef.current=schedule;
      observer=new ResizeObserver(()=>schedule());observer.observe(canvas);
      const contextLost=(event:Event)=>{event.preventDefault();fail();};canvas.addEventListener("webglcontextlost",contextLost);
      const visibility=()=>{visible=!document.hidden;if(visible){lastFrame=0;schedule();}else if(animationFrame){cancelAnimationFrame(animationFrame);animationFrame=0;}};
      document.addEventListener("visibilitychange",visibility);
      schedule();
      return()=>{
        canvas.removeEventListener("webglcontextlost",contextLost);document.removeEventListener("visibilitychange",visibility);observer?.disconnect();
        if(animationFrame)cancelAnimationFrame(animationFrame);redrawRef.current=undefined;
        buffers.forEach(buffer=>gl.deleteBuffer(buffer));programs.forEach(program=>gl.deleteProgram(program));
      };
    }catch{
      fail();
      buffers.forEach(buffer=>gl.deleteBuffer(buffer));programs.forEach(program=>gl.deleteProgram(program));
    }
  },[interaction]);

  useEffect(()=>{redrawRef.current?.();},[state,paused]);
  return <canvas ref={canvasRef} className="nucleusCanvas" aria-hidden="true" />;
}
