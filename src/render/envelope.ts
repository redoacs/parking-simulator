import envelopeWgsl from './shaders/envelope.wgsl?raw';
import type { Polygon, Rect } from '../geom/polygon';
import type { Vec2 } from '../geom/vec2';
import { CAMERA_UNIFORM_BYTES } from './gpu';
import { buildVertexData, PolygonBatch, PolygonPipeline, type ColoredPolygon, type RGBA } from './polygons';
import { COLORS } from './scenePolys';

export const ENVELOPE_PX_PER_M = 200;
const ENVELOPE_FORMAT: GPUTextureFormat = 'r8unorm';

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

const MAX_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one', operation: 'max' },
  alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'max' },
};

const WHITE: RGBA = [1, 1, 1, 1];

export class EnvelopePass {
  private texture: GPUTexture | null = null;
  private view: GPUTextureView | null = null;
  private bounds: Rect = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  private width = 1;
  private height = 1;
  private readonly accumPipeline: PolygonPipeline;
  private readonly accumBatch: PolygonBatch;
  private readonly accumCameraBuffer: GPUBuffer;
  private readonly accumCameraBindGroup: GPUBindGroup;
  private readonly compositePipeline: GPURenderPipeline;
  private readonly compositeLayout: GPUBindGroupLayout;
  private readonly envUniform: GPUBuffer;
  private readonly sampler: GPUSampler;
  private compositeBindGroup: GPUBindGroup | null = null;
  private readonly readback: GPUBuffer;

  constructor(private readonly device: GPUDevice, canvasFormat: GPUTextureFormat, cameraLayout: GPUBindGroupLayout) {
    this.accumPipeline = new PolygonPipeline(device, ENVELOPE_FORMAT, cameraLayout, MAX_BLEND);
    this.accumBatch = new PolygonBatch(device, 256 * 1024);
    this.accumCameraBuffer = device.createBuffer({ size: CAMERA_UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.accumCameraBindGroup = device.createBindGroup({ layout: cameraLayout, entries: [{ binding: 0, resource: { buffer: this.accumCameraBuffer } }] });

    this.compositeLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });
    const module = device.createShaderModule({ code: envelopeWgsl });
    this.compositePipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [cameraLayout, this.compositeLayout] }),
      vertex: { module, entryPoint: 'vs' },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{ format: canvasFormat, blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }],
      },
      primitive: { topology: 'triangle-list' },
    });
    this.envUniform = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.readback = device.createBuffer({ size: 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  }

  /** (Re)allocate for new bounds. The texture starts cleared to 0. */
  setBounds(bounds: Rect, maxDim: number): void {
    this.texture?.destroy();
    const size = envelopeTextureSize(bounds, maxDim);
    this.bounds = bounds;
    this.width = size.width;
    this.height = size.height;
    this.texture = this.device.createTexture({
      size: { width: size.width, height: size.height },
      format: ENVELOPE_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    });
    this.view = this.texture.createView();
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    const sx = 2 / w;
    const sy = 2 / h;
    this.device.queue.writeBuffer(
      this.accumCameraBuffer, 0,
      new Float32Array([sx, sy, -((bounds.minX + bounds.maxX) / 2) * sx, -((bounds.minY + bounds.maxY) / 2) * sy, size.width, size.height, 0, 0]),
    );
    const t = COLORS.envelope;
    this.device.queue.writeBuffer(this.envUniform, 0, new Float32Array([bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, t[0], t[1], t[2], t[3]]));
    this.compositeBindGroup = this.device.createBindGroup({
      layout: this.compositeLayout,
      entries: [
        { binding: 0, resource: { buffer: this.envUniform } },
        { binding: 1, resource: this.view },
        { binding: 2, resource: this.sampler },
      ],
    });
  }

  clear(encoder: GPUCommandEncoder): void {
    if (!this.view) return;
    encoder.beginRenderPass({ colorAttachments: [{ view: this.view, loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 0 }, storeOp: 'store' }] }).end();
  }

  accumulate(encoder: GPUCommandEncoder, footprints: Polygon[]): void {
    if (!this.view || footprints.length === 0) return;
    const polys: ColoredPolygon[] = footprints.map((polygon) => ({ polygon, color: WHITE }));
    this.accumBatch.upload(buildVertexData(polys));
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.view, loadOp: 'load', storeOp: 'store' }] });
    this.accumPipeline.draw(pass, this.accumBatch, this.accumCameraBindGroup);
    pass.end();
  }

  composite(pass: GPURenderPassEncoder, cameraBindGroup: GPUBindGroup): void {
    if (!this.compositeBindGroup) return;
    pass.setPipeline(this.compositePipeline);
    pass.setBindGroup(0, cameraBindGroup);
    pass.setBindGroup(1, this.compositeBindGroup);
    pass.draw(6);
  }

  /** Coverage 0..1 at a world point (0 outside bounds). Used by the e2e smoke test. */
  async readAt(p: Vec2): Promise<number> {
    if (!this.texture) return 0;
    const t = envelopeTexel(this.bounds, this.width, this.height, p);
    if (!t) return 0;
    const encoder = this.device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture: this.texture, origin: { x: t.x, y: t.y } }, { buffer: this.readback, bytesPerRow: 256 }, { width: 1, height: 1 });
    this.device.queue.submit([encoder.finish()]);
    await this.readback.mapAsync(GPUMapMode.READ);
    const value = new Uint8Array(this.readback.getMappedRange())[0]! / 255;
    this.readback.unmap();
    return value;
  }
}
