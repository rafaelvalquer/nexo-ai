export const noise = `
float hash(vec3 p) { p = fract(p * .3183099 + vec3(.1,.2,.3)); p *= 17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise3(vec3 p) {
  vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float field(vec3 p) { return noise3(p)*.55+noise3(p*2.02)*.28+noise3(p*4.03)*.14; }
`;

export const coreVertex = `
uniform float time;
varying vec3 surface;
varying vec3 normalView;
varying vec3 eye;
${noise}
void main() {
  surface = position;
  vec3 displaced = position + normal * (field(position*3.+time*.12)-.45)*.09;
  vec4 view = modelViewMatrix * vec4(displaced,1.);
  normalView = normalize(normalMatrix*normal);
  eye = normalize(-view.xyz);
  gl_Position = projectionMatrix*view;
}`;

export const coreFragment = `
uniform float time;
uniform vec3 primary;
uniform vec3 secondary;
varying vec3 surface;
varying vec3 normalView;
varying vec3 eye;
${noise}
void main() {
  vec3 p=surface;
  float flow=field(p*2.9+vec3(time*.08,-time*.1,time*.04));
  float ribbons=pow(.5+.5*sin((p.y+p.x*.5+flow*1.8)*34.-time*.65),14.);
  float fine=pow(.5+.5*sin((p.y-flow*.6+p.z*.2)*92.+time*.2),24.);
  float facing=max(0.,dot(normalize(normalView),normalize(eye)));
  float rim=pow(1.-facing,2.5);
  float light=pow(max(0.,dot(normalize(normalView),normalize(vec3(-.7,.9,1.)))),12.);
  vec3 color=mix(vec3(.015,.028,.065),primary*.19,flow);
  color += mix(primary,secondary,smoothstep(-.7,.6,p.x+p.y*.6))*(ribbons*.82+fine*.16+rim*.72);
  color += vec3(.63,.9,1.)*light*.38;
  color *= .55+facing*.45;
  gl_FragColor=vec4(color,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const particleVertex = `
uniform float time;
uniform float spread;
attribute float seed;
varying float brightness;
void main() {
  vec3 p=position*(1.+spread*.15);
  p += normalize(position)*sin(time*.5+seed*30.)*.06;
  brightness=.3+.7*(.5+.5*sin(seed*21.+time*.8));
  vec4 view=modelViewMatrix*vec4(p,1.);
  gl_Position=projectionMatrix*view;
  gl_PointSize=(1.5+seed*2.)*min(2.,5./-view.z);
}`;
export const particleFragment = `
uniform vec3 color;
varying float brightness;
void main() {
  float radius=length(gl_PointCoord-.5)*2.;
  if(radius>1.)discard;
  gl_FragColor=vec4(color,(1.-radius)*brightness*.8);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
