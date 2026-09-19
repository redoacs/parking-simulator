layout(std140) uniform Camera {
  vec2 scale;
  vec2 offset;
  vec2 viewport;
  vec2 pad;
} cam;

#ifdef VERTEX
layout(location = 0) in vec2 aCenter;
layout(location = 1) in float aRadius;
layout(location = 2) in float aThickness;
layout(location = 3) in vec4 aColor;
out vec2 vOff;
out float vRadius;
out float vThickness;
out vec4 vColor;

const vec2 CORNERS[6] = vec2[6](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(1.0, 1.0), vec2(-1.0, -1.0), vec2(1.0, 1.0), vec2(-1.0, 1.0));

void main() {
  float ext = aRadius + aThickness;
  vec2 off = CORNERS[gl_VertexID] * ext;
  gl_Position = vec4((aCenter + off) * cam.scale + cam.offset, 0.0, 1.0);
  vOff = off;
  vRadius = aRadius;
  vThickness = aThickness;
  vColor = aColor;
}
#endif

#ifdef FRAGMENT
in vec2 vOff;
in float vRadius;
in float vThickness;
in vec4 vColor;
out vec4 outColor;

void main() {
  float d = abs(length(vOff) - vRadius);
  float aa = fwidth(d);
  float halfT = vThickness * 0.5;
  float a = (1.0 - smoothstep(halfT - aa, halfT + aa, d)) * vColor.a;
  outColor = vec4(vColor.rgb * a, a);
}
#endif
