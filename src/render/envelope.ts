import envelopeSrc from './shaders/envelope.glsl?raw';
import type { Polygon, Rect } from '../geom/polygon';
import type { Vec2 } from '../geom/vec2';
import {
  CAMERA_BINDING,
  CAMERA_UNIFORM_BYTES,
  compileProgram,
  createUniformBuffer,
  ENVELOPE_BINDING,
  setBlend,
  writeUniformBuffer,
} from './gl';
import { buildVertexData, PolygonBatch, PolygonPipeline, type ColoredPolygon, type RGBA } from './polygons';
import { COLORS } from './scenePolys';

export const ENVELOPE_PX_PER_M = 200;

export function envelopeTextureSize(b: Rect, maxDim: number): { width: number; height: number; pxPerM: number } {
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const pxPerM = Math.min(ENVELOPE_PX_PER_M, maxDim / w, maxDim / h);
  return { width: Math.max(1, Math.round(w * pxPerM)), height: Math.max(1, Math.round(h * pxPerM)), pxPerM };
}

export function envelopeTexel(b: Rect, width: number, height: number, p: Vec2): { x: number; y: number } | null {
  if (p.x < b.minX || p.x >= b.maxX || p.y <= b.minY || p.y > b.maxY) return null;
  const x = Math.floor(((p.x - b.minX) / (b.maxX - b.minX)) * width);
  const y = Math.floor(((b.maxY - p.y) / (b.maxY - b.minY)) * height);
  return { x: Math.min(width - 1, x), y: Math.min(height - 1, y) };
}

const WHITE: RGBA = [1, 1, 1, 1];

/**
 * Swept-path coverage: footprints are accumulated with MAX blending into a single-channel texture that covers the
 * scene bounds, then composited over the scene with a tint.
 */
export class EnvelopePass {
  private texture: WebGLTexture | null = null;
  private readonly framebuffer: WebGLFramebuffer;
  private bounds: Rect = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  private width = 1;
  private height = 1;
  private readonly accumPipeline: PolygonPipeline;
  private readonly accumBatch: PolygonBatch;
  private readonly accumCamera: WebGLBuffer;
  private readonly compositeProgram: WebGLProgram;
  private readonly compositeVao: WebGLVertexArrayObject;
  private readonly envUniform: WebGLBuffer;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.framebuffer = gl.createFramebuffer();
    this.accumPipeline = new PolygonPipeline(gl, 'max');
    this.accumBatch = new PolygonBatch(gl);
    this.accumCamera = createUniformBuffer(gl, CAMERA_UNIFORM_BYTES);
    this.compositeProgram = compileProgram(gl, envelopeSrc);
    this.compositeVao = gl.createVertexArray(); // no attributes: the quad comes from gl_VertexID
    this.envUniform = createUniformBuffer(gl, 32); // uTex needs no setup: a sampler uniform is 0 after link, and composite() binds unit 0
  }

  /** (Re)allocate for new bounds. The texture starts cleared to 0. */
  setBounds(bounds: Rect, maxDim: number): void {
    const gl = this.gl;
    if (this.texture) gl.deleteTexture(this.texture);
    const size = envelopeTextureSize(bounds, maxDim);
    this.bounds = bounds;
    this.width = size.width;
    this.height = size.height;
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, size.width, size.height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE && !gl.isContextLost()) {
      throw new Error(`Envelope framebuffer incomplete (status 0x${status.toString(16)}).`);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    const sx = 2 / w;
    const sy = 2 / h;
    writeUniformBuffer(
      gl,
      this.accumCamera,
      new Float32Array([
        sx,
        sy,
        -((bounds.minX + bounds.maxX) / 2) * sx,
        -((bounds.minY + bounds.maxY) / 2) * sy,
        size.width,
        size.height,
        0,
        0,
      ]),
    );
    const t = COLORS.envelope;
    writeUniformBuffer(gl, this.envUniform, new Float32Array([bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, t[0], t[1], t[2], t[3]]));
    this.clear();
  }

  clear(): void {
    if (!this.texture) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Leaves the default framebuffer bound; the caller restores its own viewport and camera block. */
  accumulate(footprints: Polygon[]): void {
    if (!this.texture || footprints.length === 0) return;
    const gl = this.gl;
    const polys: ColoredPolygon[] = footprints.map((polygon) => ({ polygon, color: WHITE }));
    this.accumBatch.upload(buildVertexData(polys));
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, CAMERA_BINDING, this.accumCamera);
    this.accumPipeline.draw(this.accumBatch);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  composite(): void {
    if (!this.texture) return;
    const gl = this.gl;
    gl.useProgram(this.compositeProgram);
    setBlend(gl, 'premultiplied');
    gl.bindBufferBase(gl.UNIFORM_BUFFER, ENVELOPE_BINDING, this.envUniform);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.bindVertexArray(this.compositeVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /** Coverage 0..1 at a world point (0 outside bounds). Used by the e2e smoke test. */
  readAt(p: Vec2): Promise<number> {
    if (!this.texture) return Promise.resolve(0);
    const t = envelopeTexel(this.bounds, this.width, this.height, p);
    if (!t) return Promise.resolve(0);
    const gl = this.gl;
    const out = new Uint8Array(4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    // envelopeTexel counts rows from the top (maxY); a GL framebuffer counts them from the bottom.
    gl.readPixels(t.x, this.height - 1 - t.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return Promise.resolve(out[0]! / 255);
  }
}
