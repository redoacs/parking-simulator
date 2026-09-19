import gridSrc from './shaders/grid.glsl?raw';
import { compileProgram, setBlend } from './gl';

export class GridPipeline {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.program = compileProgram(gl, gridSrc);
    this.vao = gl.createVertexArray(); // no attributes: the shader builds a fullscreen triangle from gl_VertexID
  }

  draw(): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    setBlend(gl, 'none');
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
