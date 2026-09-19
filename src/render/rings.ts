import ringSrc from './shaders/ring.glsl?raw';
import { compileProgram, setBlend } from './gl';
import type { RingInstance } from './renderer';

const FLOATS_PER_INSTANCE = 8;

export class RingPipeline {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buffer: WebGLBuffer;
  private count = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.program = compileProgram(gl, ringSrc);
    this.vao = gl.createVertexArray();
    this.buffer = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const stride = FLOATS_PER_INSTANCE * 4;
    // [location, components, byte offset]: centre, radius, thickness, colour. One set per instance.
    for (const [location, size, offset] of [
      [0, 2, 0],
      [1, 1, 8],
      [2, 1, 12],
      [3, 4, 16],
    ] as const) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
      gl.vertexAttribDivisor(location, 1);
    }
    gl.bindVertexArray(null);
  }

  upload(rings: RingInstance[]): void {
    const data = new Float32Array(rings.length * FLOATS_PER_INSTANCE);
    rings.forEach((r, i) => {
      data.set([r.center.x, r.center.y, r.radius, r.thickness, ...r.color], i * FLOATS_PER_INSTANCE);
    });
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    this.count = rings.length;
  }

  draw(): void {
    if (this.count === 0) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    setBlend(gl, 'premultiplied');
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
  }
}
