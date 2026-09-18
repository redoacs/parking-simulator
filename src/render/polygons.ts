import polyWgsl from './shaders/poly.wgsl?raw';
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

/** A GPU vertex buffer that grows to fit; `vertexCount` is what to draw. */
export class PolygonBatch {
  buffer: GPUBuffer;
  capacityBytes: number;
  vertexCount = 0;

  constructor(private readonly device: GPUDevice, initialBytes = 64 * 1024) {
    this.capacityBytes = initialBytes;
    this.buffer = device.createBuffer({ size: initialBytes, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  }

  upload(data: Float32Array<ArrayBuffer>): void {
    if (data.byteLength > this.capacityBytes) {
      this.buffer.destroy();
      this.capacityBytes = Math.max(data.byteLength, this.capacityBytes * 2);
      this.buffer = this.device.createBuffer({ size: this.capacityBytes, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    }
    if (data.byteLength > 0) this.device.queue.writeBuffer(this.buffer, 0, data);
    this.vertexCount = data.length / FLOATS_PER_VERTEX;
  }

  destroy(): void {
    this.buffer.destroy();
  }
}

export const POLYGON_VERTEX_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: FLOATS_PER_VERTEX * 4,
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x2' },
    { shaderLocation: 1, offset: 8, format: 'float32x4' },
  ],
};

export const PREMULTIPLIED_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
};

export class PolygonPipeline {
  readonly pipeline: GPURenderPipeline;

  constructor(device: GPUDevice, format: GPUTextureFormat, cameraLayout: GPUBindGroupLayout, blend: GPUBlendState | undefined = PREMULTIPLIED_BLEND) {
    const module = device.createShaderModule({ code: polyWgsl });
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [cameraLayout] }),
      vertex: { module, entryPoint: 'vs', buffers: [POLYGON_VERTEX_LAYOUT] },
      fragment: { module, entryPoint: 'fs', targets: [blend ? { format, blend } : { format }] },
      primitive: { topology: 'triangle-list' },
    });
  }

  draw(pass: GPURenderPassEncoder, batch: PolygonBatch, cameraBindGroup: GPUBindGroup): void {
    if (batch.vertexCount === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, cameraBindGroup);
    pass.setVertexBuffer(0, batch.buffer);
    pass.draw(batch.vertexCount);
  }
}
