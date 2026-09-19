struct Camera {
  scale: vec2f,
  offset: vec2f,
  viewport: vec2f,
  pad: vec2f,
};
struct Envelope {
  boundsMin: vec2f,
  boundsMax: vec2f,
  tint: vec4f,
};
@group(0) @binding(0) var<uniform> cam: Camera;
@group(1) @binding(0) var<uniform> env: Envelope;
@group(1) @binding(1) var tex: texture_2d<f32>;
@group(1) @binding(2) var samp: sampler;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var corners = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
    vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0));
  let c = corners[i];
  let world = mix(env.boundsMin, env.boundsMax, c);
  var o: VSOut;
  o.pos = vec4f(world * cam.scale + cam.offset, 0.0, 1.0);
  o.uv = vec2f(c.x, 1.0 - c.y); // texture row 0 is maxY
  return o;
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let a = textureSample(tex, samp, in.uv).r * env.tint.a;
  return vec4f(env.tint.rgb * a, a);
}
