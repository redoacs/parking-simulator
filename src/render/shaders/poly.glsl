layout(std140) uniform Camera {
  vec2 scale;
  vec2 offset;
  vec2 viewport;
  vec2 pad;
} cam;

#ifdef VERTEX
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec4 aColor;
out vec4 vColor;

void main() {
  gl_Position = vec4(aPos * cam.scale + cam.offset, 0.0, 1.0);
  vColor = aColor;
}
#endif

#ifdef FRAGMENT
in vec4 vColor;
out vec4 outColor;

void main() {
  outColor = vec4(vColor.rgb * vColor.a, vColor.a); // premultiplied
}
#endif
