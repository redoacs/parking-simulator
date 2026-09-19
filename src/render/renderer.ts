import type { Polygon, Rect } from '../geom/polygon';
import type { Vec2 } from '../geom/vec2';
import { Camera } from './camera';
import { EnvelopePass } from './envelope';
import { CAMERA_UNIFORM_BYTES, createCameraBindGroupLayout, initGpu, type GpuContext } from './gpu';
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
  private readonly cameraBuffer: GPUBuffer;
  private readonly cameraBindGroup: GPUBindGroup;
  private readonly grid: GridPipeline;
  private readonly polys: PolygonPipeline;
  private readonly envelope: EnvelopePass;
  private readonly rings: RingPipeline;
  private readonly staticBatch: PolygonBatch;
  private readonly dynamicBatch: PolygonBatch;
  private uploadedStaticVersion = -1;
  private envelopeVersion = -1;

  private constructor(private readonly gpu: GpuContext) {
    const { device, format } = gpu;
    const layout = createCameraBindGroupLayout(device);
    this.cameraBuffer = device.createBuffer({ size: CAMERA_UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.cameraBindGroup = device.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer: this.cameraBuffer } }] });
    this.grid = new GridPipeline(device, format, layout);
    this.polys = new PolygonPipeline(device, format, layout);
    this.envelope = new EnvelopePass(device, format, layout);
    this.rings = new RingPipeline(device, format, layout);
    this.staticBatch = new PolygonBatch(device);
    this.dynamicBatch = new PolygonBatch(device);
    this.resize();
  }

  static async create(canvas: HTMLCanvasElement): Promise<Renderer> {
    return new Renderer(await initGpu(canvas));
  }

  get device(): GPUDevice {
    return this.gpu.device;
  }

  /** Match the canvas backing store to its CSS size × devicePixelRatio. */
  resize(): void {
    const c = this.gpu.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(c.clientWidth * dpr));
    const h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    this.camera.resize(w, h, dpr);
  }

  frame(input: FrameInput): void {
    const { device, context } = this.gpu;
    if (input.staticVersion !== this.uploadedStaticVersion) {
      this.staticBatch.upload(buildVertexData(input.staticPolys));
      this.uploadedStaticVersion = input.staticVersion;
    }
    this.dynamicBatch.upload(buildVertexData(input.dynamicPolys));
    device.queue.writeBuffer(this.cameraBuffer, 0, this.camera.uniformData());
    if (input.envelopeVersion !== this.envelopeVersion) {
      this.envelope.setBounds(input.envelopeBounds, device.limits.maxTextureDimension2D);
      this.envelopeVersion = input.envelopeVersion;
    }
    this.rings.upload(input.rings);

    const encoder = device.createCommandEncoder();
    this.envelope.accumulate(encoder, input.newFootprints);
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: 'clear',
          clearValue: { r: 0.078, g: 0.09, b: 0.11, a: 1 },
          storeOp: 'store',
        },
      ],
    });
    this.grid.draw(pass, this.cameraBindGroup);
    this.polys.draw(pass, this.staticBatch, this.cameraBindGroup);
    this.envelope.composite(pass, this.cameraBindGroup);
    this.rings.draw(pass, this.cameraBindGroup);
    this.polys.draw(pass, this.dynamicBatch, this.cameraBindGroup);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  resetEnvelope(): void {
    const encoder = this.device.createCommandEncoder();
    this.envelope.clear(encoder);
    this.device.queue.submit([encoder.finish()]);
  }

  rebuildEnvelope(footprints: Polygon[]): void {
    const encoder = this.device.createCommandEncoder();
    this.envelope.clear(encoder);
    this.envelope.accumulate(encoder, footprints);
    this.device.queue.submit([encoder.finish()]);
  }

  readEnvelopeAt(p: Vec2): Promise<number> {
    return this.envelope.readAt(p);
  }
}
