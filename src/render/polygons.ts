import polySrc from './shaders/poly.glsl?raw';
import { compileProgram, setBlend, type BlendMode } from './gl';
import { fanTriangles, type Polygon } from '../geom/polygon';

export type RGBA = [number, number, number, number];

export interface ColoredPolygon {
  polygon: Polygon;
  color: RGBA;
}

const FLOATS_PER_VERTEX = 6;

/** Interleaved [x, y, r, g, b, a] triangle list for a set of convex polygons. */
export function buildVertexData(polys: ColoredPolygon[]): Float32Array<ArrayBuffer> {
  let count = 0;
  for (const p of polys) count += Math.max(0, p.polygon.length - 2) * 3;
  const out = new Float32Array(count * FLOATS_PER_VERTEX);
  let o = 0;
  for (const p of polys) {
    for (const v of fanTriangles(p.polygon)) {
      out[o++] = v.x;
      out[o++] = v.y;
      out[o++] = p.color[0];
      out[o++] = p.color[1];
      out[o++] = p.color[2];
      out[o++] = p.color[3];
    }
  }
  return out;
}

/** A vertex buffer and the vertex array that describes it; `vertexCount` is what to draw. */
export class PolygonBatch {
  readonly vao: WebGLVertexArrayObject;
  private readonly buffer: WebGLBuffer;
  vertexCount = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.vao = gl.createVertexArray();
    this.buffer = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const stride = FLOATS_PER_VERTEX * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 8);
    gl.bindVertexArray(null);
  }

  /** Re-specifying the store keeps the buffer object, so the vertex array never needs rebuilding. */
  upload(data: Float32Array<ArrayBuffer>): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    this.vertexCount = data.length / FLOATS_PER_VERTEX;
  }
}

export class PolygonPipeline {
  private readonly program: WebGLProgram;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly blend: BlendMode = 'premultiplied',
  ) {
    this.program = compileProgram(gl, polySrc);
  }

  /** Draws into whatever framebuffer is bound, with whatever camera block is bound. */
  draw(batch: PolygonBatch): void {
    if (batch.vertexCount === 0) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    setBlend(gl, this.blend);
    gl.bindVertexArray(batch.vao);
    gl.drawArrays(gl.TRIANGLES, 0, batch.vertexCount);
  }
}
