import ringWgsl from './shaders/ring.wgsl?raw';
import { PREMULTIPLIED_BLEND } from './polygons';
import type { RingInstance } from './renderer';

const FLOATS_PER_INSTANCE = 8;

export class RingPipeline {
  readonly pipeline: GPURenderPipeline;
  private buffer: GPUBuffer;
  private capacityBytes = 64 * FLOATS_PER_INSTANCE * 4;
  private count = 0;

  constructor(
    private readonly device: GPUDevice,
    format: GPUTextureFormat,
    cameraLayout: GPUBindGroupLayout,
  ) {
    const module = device.createShaderModule({ code: ringWgsl });
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [cameraLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: FLOATS_PER_INSTANCE * 4,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },
              { shaderLocation: 1, offset: 8, format: 'float32' },
              { shaderLocation: 2, offset: 12, format: 'float32' },
              { shaderLocation: 3, offset: 16, format: 'float32x4' },
            ],
          },
        ],
      },
      fragment: { module, entryPoint: 'fs', targets: [{ format, blend: PREMULTIPLIED_BLEND }] },
      primitive: { topology: 'triangle-list' },
    });
    this.buffer = device.createBuffer({ size: this.capacityBytes, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  }

  upload(rings: RingInstance[]): void {
    const data = new Float32Array(rings.length * FLOATS_PER_INSTANCE);
    rings.forEach((r, i) => {
      data.set([r.center.x, r.center.y, r.radius, r.thickness, ...r.color], i * FLOATS_PER_INSTANCE);
    });
    if (data.byteLength > this.capacityBytes) {
      this.buffer.destroy();
      this.capacityBytes = Math.max(data.byteLength, this.capacityBytes * 2);
      this.buffer = this.device.createBuffer({ size: this.capacityBytes, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    }
    if (data.byteLength > 0) this.device.queue.writeBuffer(this.buffer, 0, data);
    this.count = rings.length;
  }

  draw(pass: GPURenderPassEncoder, cameraBindGroup: GPUBindGroup): void {
    if (this.count === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, cameraBindGroup);
    pass.setVertexBuffer(0, this.buffer);
    pass.draw(6, this.count);
  }
}
