export class WebGlUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebGlUnavailableError';
  }
}

export function initGl(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
  if (!gl) throw new WebGlUnavailableError('This browser has no WebGL2.');
  return gl;
}

/** Uniform block bindings shared by every program: the block name decides the binding point. */
export const CAMERA_BINDING = 0;
export const ENVELOPE_BINDING = 1;
const BLOCK_BINDINGS: Record<string, number> = { Camera: CAMERA_BINDING, Envelope: ENVELOPE_BINDING };

export const CAMERA_UNIFORM_BYTES = 32;

function compileStage(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Could not create a shader object.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(shader) ?? 'no log'}`);
  }
  return shader;
}

/**
 * One source file holds both stages, split by `#ifdef VERTEX` / `#ifdef FRAGMENT`.
 * `#version` must be the first line of a GLSL source, so it is prefixed here and never appears in the file.
 */
export function compileProgram(gl: WebGL2RenderingContext, source: string): WebGLProgram {
  const program = gl.createProgram();
  const vs = compileStage(gl, gl.VERTEX_SHADER, `#version 300 es\n#define VERTEX\n${source}`);
  const fs = compileStage(gl, gl.FRAGMENT_SHADER, `#version 300 es\n#define FRAGMENT\nprecision highp float;\n${source}`);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new Error(`Program link failed: ${gl.getProgramInfoLog(program) ?? 'no log'}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  for (const [name, binding] of Object.entries(BLOCK_BINDINGS)) {
    const index = gl.getUniformBlockIndex(program, name);
    if (index !== gl.INVALID_INDEX) gl.uniformBlockBinding(program, index, binding);
  }
  return program;
}

/** A std140 uniform buffer of fixed size. */
export function createUniformBuffer(gl: WebGL2RenderingContext, bytes: number): WebGLBuffer {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
  gl.bufferData(gl.UNIFORM_BUFFER, bytes, gl.DYNAMIC_DRAW);
  return buffer;
}

export function writeUniformBuffer(gl: WebGL2RenderingContext, buffer: WebGLBuffer, data: Float32Array<ArrayBuffer>): void {
  gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
  gl.bufferSubData(gl.UNIFORM_BUFFER, 0, data);
}

export type BlendMode = 'none' | 'premultiplied' | 'max';

/** Every draw states the blending it needs; nothing relies on what the previous draw left behind. */
export function setBlend(gl: WebGL2RenderingContext, mode: BlendMode): void {
  if (mode === 'none') {
    gl.disable(gl.BLEND);
    return;
  }
  gl.enable(gl.BLEND);
  gl.blendEquation(mode === 'max' ? gl.MAX : gl.FUNC_ADD);
  gl.blendFunc(gl.ONE, mode === 'max' ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA); // factors are ignored for MAX
}
