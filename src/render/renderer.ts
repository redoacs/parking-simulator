import type { Polygon, Rect } from '../geom/polygon';
import type { Vec2 } from '../geom/vec2';
import { Camera } from './camera';
import { EnvelopePass } from './envelope';
import { CAMERA_BINDING, CAMERA_UNIFORM_BYTES, createUniformBuffer, initGl, writeUniformBuffer } from './gl';
import { GridPipeline } from './grid';
import { buildVertexData, PolygonBatch, PolygonPipeline, type ColoredPolygon, type RGBA } from './polygons';
import { RingPipeline } from './rings';

export interface RingInstance {
  center: Vec2;
  radius: number;
  thickness: number;
  color: RGBA;
}

export interface FrameInput {
  staticPolys: ColoredPolygon[];
  /** Bump when staticPolys change; the renderer re-uploads only then. */
  staticVersion: number;
  dynamicPolys: ColoredPolygon[];
  rings: RingInstance[];
  /** Footprints simulated since the previous frame, to accumulate into the envelope. */
  newFootprints: Polygon[];
  envelopeBounds: Rect;
  /** Bump when envelopeBounds change; the renderer reallocates and clears. */
  envelopeVersion: number;
}

export class Renderer {
  readonly camera = new Camera();
  private readonly canvas: HTMLCanvasElement;
  private readonly cameraBuffer: WebGLBuffer;
  private readonly grid: GridPipeline;
  private readonly polys: PolygonPipeline;
  private readonly envelope: EnvelopePass;
  private readonly rings: RingPipeline;
  private readonly staticBatch: PolygonBatch;
  private readonly dynamicBatch: PolygonBatch;
  private uploadedStaticVersion = -1;
  private envelopeVersion = -1;

  private constructor(
    private readonly gl: WebGL2RenderingContext,
    canvas: HTMLCanvasElement,
  ) {
    this.canvas = canvas;
    this.cameraBuffer = createUniformBuffer(gl, CAMERA_UNIFORM_BYTES);
    this.grid = new GridPipeline(gl);
    this.polys = new PolygonPipeline(gl);
    this.envelope = new EnvelopePass(gl);
    this.rings = new RingPipeline(gl);
    this.staticBatch = new PolygonBatch(gl);
    this.dynamicBatch = new PolygonBatch(gl);
    this.resize();
  }

  /** Stays async so callers need not change if a backend ever has to wait for its device again. */
  static create(canvas: HTMLCanvasElement): Promise<Renderer> {
    return Promise.resolve(new Renderer(initGl(canvas), canvas));
  }

  /** The GL context was lost (GPU reset, driver update, too many contexts). Nothing is drawn after this. */
  onContextLost(cb: (message: string) => void): void {
    // No preventDefault: that would opt into a restored context, and nothing here rebuilds GL objects for one.
    this.canvas.addEventListener('webglcontextlost', () => {
      cb('WebGL context lost');
    });
  }

  /** Match the canvas backing store to its CSS size × devicePixelRatio. */
  resize(): void {
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(c.clientWidth * dpr));
    const h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    // WebGL may allocate a smaller drawing buffer than the canvas asks for (very large canvases, high DPR), and it
    // clamps each axis on its own. Ask again for a size that fits and keeps the aspect, so the picture is neither
    // clipped nor stretched, then size the camera from what was actually allocated.
    const gl = this.gl;
    if (gl.drawingBufferWidth !== c.width || gl.drawingBufferHeight !== c.height) {
      const k = Math.min(gl.drawingBufferWidth / c.width, gl.drawingBufferHeight / c.height);
      c.width = Math.max(1, Math.floor(c.width * k));
      c.height = Math.max(1, Math.floor(c.height * k));
    }
    const bw = gl.drawingBufferWidth;
    this.camera.resize(bw, gl.drawingBufferHeight, c.clientWidth > 0 ? bw / c.clientWidth : dpr);
  }

  frame(input: FrameInput): void {
    const gl = this.gl;
    if (input.staticVersion !== this.uploadedStaticVersion) {
      this.staticBatch.upload(buildVertexData(input.staticPolys));
      this.uploadedStaticVersion = input.staticVersion;
    }
    this.dynamicBatch.upload(buildVertexData(input.dynamicPolys));
    writeUniformBuffer(gl, this.cameraBuffer, this.camera.uniformData());
    if (input.envelopeVersion !== this.envelopeVersion) {
      this.envelope.setBounds(input.envelopeBounds, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number);
      this.envelopeVersion = input.envelopeVersion;
    }
    this.rings.upload(input.rings);

    this.envelope.accumulate(input.newFootprints);

    // accumulate() may have changed the viewport and the camera block; the screen pass sets both.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, CAMERA_BINDING, this.cameraBuffer);
    gl.clearColor(0.078, 0.09, 0.11, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.grid.draw();
    this.polys.draw(this.staticBatch);
    this.envelope.composite();
    this.rings.draw();
    this.polys.draw(this.dynamicBatch);
  }

  resetEnvelope(): void {
    this.envelope.clear();
  }

  rebuildEnvelope(footprints: Polygon[]): void {
    this.envelope.clear();
    this.envelope.accumulate(footprints);
  }

  readEnvelopeAt(p: Vec2): Promise<number> {
    return this.envelope.readAt(p);
  }
}
