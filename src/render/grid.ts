import gridWgsl from './shaders/grid.wgsl?raw';

export class GridPipeline {
  readonly pipeline: GPURenderPipeline;

  constructor(device: GPUDevice, format: GPUTextureFormat, cameraLayout: GPUBindGroupLayout) {
    const module = device.createShaderModule({ code: gridWgsl });
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [cameraLayout] }),
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
  }

  draw(pass: GPURenderPassEncoder, cameraBindGroup: GPUBindGroup): void {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, cameraBindGroup);
    pass.draw(3);
  }
}
