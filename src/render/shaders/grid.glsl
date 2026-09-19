layout(std140) uniform Camera {
  vec2 scale;
  vec2 offset;
  vec2 viewport;
  vec2 pad;
} cam;

#ifdef VERTEX
out vec2 vClip;

// Fullscreen triangle.
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));

void main() {
  gl_Position = vec4(P[gl_VertexID], 0.0, 1.0);
  vClip = P[gl_VertexID];
}
#endif

#ifdef FRAGMENT
in vec2 vClip;
out vec4 outColor;

float lineMask(vec2 world, float spacing) {
  vec2 g = abs(fract(world / spacing - 0.5) - 0.5) / fwidth(world / spacing);
  return 1.0 - min(min(g.x, g.y), 1.0);
}

void main() {
  vec2 world = (vClip - cam.offset) / cam.scale;
  float metresPerPx = fwidth(world.x);
  vec3 bg = vec3(0.078, 0.090, 0.110);
  float minorPx = 0.1 / metresPerPx;
  float minorFade = smoothstep(4.0, 12.0, minorPx);
  float minor = lineMask(world, 0.1) * 0.14 * minorFade;
  float major = lineMask(world, 1.0) * 0.30;
  float a = max(minor, major);
  outColor = vec4(mix(bg, vec3(0.55, 0.60, 0.70), a), 1.0);
}
#endif
