struct Camera {
  scale: vec2f,
  offset: vec2f,
  viewport: vec2f,
  pad: vec2f,
};
@group(0) @binding(0) var<uniform> cam: Camera;

struct Inst {
  @location(0) center: vec2f,
  @location(1) radius: f32,
  @location(2) thickness: f32,
  @location(3) color: vec4f,
};
struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) off: vec2f,
  @location(1) radius: f32,
  @location(2) thickness: f32,
  @location(3) color: vec4f,
};

@vertex fn vs(@builtin(vertex_index) i: u32, inst: Inst) -> VSOut {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let ext = inst.radius + inst.thickness;
  let off = corners[i] * ext;
  var o: VSOut;
  o.pos = vec4f((inst.center + off) * cam.scale + cam.offset, 0.0, 1.0);
  o.off = off;
  o.radius = inst.radius;
  o.thickness = inst.thickness;
  o.color = inst.color;
  return o;
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let d = abs(length(in.off) - in.radius);
  let aa = fwidth(d);
  let half = in.thickness * 0.5;
  let a = (1.0 - smoothstep(half - aa, half + aa, d)) * in.color.a;
  return vec4f(in.color.rgb * a, a);
}
