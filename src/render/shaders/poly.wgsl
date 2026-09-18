struct Camera {
  scale: vec2f,
  offset: vec2f,
  viewport: vec2f,
  pad: vec2f,
};
@group(0) @binding(0) var<uniform> cam: Camera;

struct VSIn {
  @location(0) pos: vec2f,
  @location(1) color: vec4f,
};
struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
};

@vertex fn vs(in: VSIn) -> VSOut {
  var o: VSOut;
  o.pos = vec4f(in.pos * cam.scale + cam.offset, 0.0, 1.0);
  o.color = in.color;
  return o;
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  return vec4f(in.color.rgb * in.color.a, in.color.a); // premultiplied
}
