struct Camera {
  scale: vec2f,
  offset: vec2f,
  viewport: vec2f,
  pad: vec2f,
};
@group(0) @binding(0) var<uniform> cam: Camera;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) clip: vec2f,
};

@vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  // Fullscreen triangle.
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VSOut;
  o.pos = vec4f(p[i], 0.0, 1.0);
  o.clip = p[i];
  return o;
}

fn lineMask(world: vec2f, spacing: f32) -> f32 {
  let g = abs(fract(world / spacing - 0.5) - 0.5) / fwidth(world / spacing);
  return 1.0 - min(min(g.x, g.y), 1.0);
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let world = (in.clip - cam.offset) / cam.scale;
  let metresPerPx = fwidth(world.x);
  let bg = vec3f(0.078, 0.090, 0.110);
  let minorPx = 0.1 / metresPerPx;
  let minorFade = smoothstep(4.0, 12.0, minorPx);
  let minor = lineMask(world, 0.1) * 0.14 * minorFade;
  let major = lineMask(world, 1.0) * 0.30;
  let a = max(minor, major);
  let col = mix(bg, vec3f(0.55, 0.60, 0.70), a);
  return vec4f(col, 1.0);
}
