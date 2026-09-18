export class WebGpuUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebGpuUnavailableError';
  }
}

export interface GpuContext {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  canvas: HTMLCanvasElement;
}

export async function initGpu(canvas: HTMLCanvasElement): Promise<GpuContext> {
  if (!('gpu' in navigator) || !navigator.gpu) throw new WebGpuUnavailableError('This browser has no WebGPU (navigator.gpu is missing).');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new WebGpuUnavailableError('WebGPU is present but no adapter was returned (GPU blocked or unsupported).');
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  if (!context) throw new WebGpuUnavailableError('Could not get a webgpu canvas context.');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });
  return { device, context, format, canvas };
}

export const CAMERA_UNIFORM_BYTES = 32;

export function createCameraBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
  return device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
  });
}
