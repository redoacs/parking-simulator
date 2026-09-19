layout(std140) uniform Camera {
  vec2 scale;
  vec2 offset;
  vec2 viewport;
  vec2 pad;
} cam;
layout(std140) uniform Envelope {
  vec2 boundsMin;
  vec2 boundsMax;
  vec4 tint;
} env;

#ifdef VERTEX
out vec2 vUv;

const vec2 CORNERS[6] = vec2[6](vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(1.0, 1.0), vec2(0.0, 0.0), vec2(1.0, 1.0), vec2(0.0, 1.0));

void main() {
  vec2 c = CORNERS[gl_VertexID];
  vec2 world = mix(env.boundsMin, env.boundsMax, c);
  gl_Position = vec4(world * cam.scale + cam.offset, 0.0, 1.0);
  vUv = c; // GL framebuffer row 0 is the bottom, i.e. minY: no flip
}
#endif

#ifdef FRAGMENT
uniform sampler2D uTex;
in vec2 vUv;
out vec4 outColor;

void main() {
  float a = texture(uTex, vUv).r * env.tint.a;
  outColor = vec4(env.tint.rgb * a, a);
}
#endif
