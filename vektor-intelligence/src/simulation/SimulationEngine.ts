/**
 * src/simulation/SimulationEngine.ts
 * VEKTOR Intelligence — WebGL2 Simulation Engine
 */

import type {
  SimulationData, SimTemplate, Phase, EngineStatus, EngineState,
  UniformDescriptor, DrawCall, AttribDescriptor,
} from "./types";
import { PHASE_STUDENT } from "./types";

const TEMPLATE_LOADERS: Record<string, () => Promise<{ default: SimTemplate }>> = {
  wave:           () => import("./templates/wave"),
  orbital:        () => import("./templates/oribital"),   // note: filename has typo "oribital" — matches actual file
  transform:      () => import("./templates/transform"),
  graph_plot:     () => import("./templates/graph_plot"),
  sort:           () => import("./templates/sort"),
  molecule:       () => import("./templates/molecule"),
  generic:        () => import("./templates/generic"),
};

export class SimulationEngine {
  private gl:          WebGL2RenderingContext | null = null;
  private canvas:      HTMLCanvasElement;
  private phase:       Phase;
  private template:    SimTemplate | null = null;
  private data:        SimulationData | null = null;
  private program:     WebGLProgram | null = null;
  private vao:         WebGLVertexArrayObject | null = null;
  private vbo:         WebGLBuffer | null = null;
  private ibo:         WebGLBuffer | null = null;
  private instanceVbo: WebGLBuffer | null = null;
  private uniforms:    Map<string, WebGLUniformLocation> = new Map();
  private rafId:       number = 0;
  private startTime:   number = 0;
  private lastFrame:   number = 0;
  private frameCount:  number = 0;
  private fps:         number = 0;
  private state:       EngineState = "idle";
  private resizeObserver: ResizeObserver | null = null;
  private onStatus?:  (s: EngineStatus) => void;

  constructor(canvas: HTMLCanvasElement, phase: Phase, onStatus?: (s: EngineStatus) => void) {
    this.canvas   = canvas;
    this.phase    = phase;
    this.onStatus = onStatus;
    const gl = canvas.getContext("webgl2", { alpha: true, antialias: true, premultipliedAlpha: false });
    if (!gl) { this.reportState("error", "WebGL2 not supported."); return; }
    this.gl = gl;
    this.setupViewport();
    this.watchResize();
    this.reportState("idle");
  }

  async load(data: SimulationData): Promise<void> {
    if (!this.gl) return;
    this.data = data;
    this.reportState("loading");
    try {
      const hint   = data.hint in TEMPLATE_LOADERS ? data.hint : "generic";
      const module = await (TEMPLATE_LOADERS[hint] ?? TEMPLATE_LOADERS.generic)();
      this.template = module.default;
      await this.compileProgram(this.template.vertexShader, this.template.fragmentShader);
      this.buildGeometry();
      this.reportState("running");
    } catch (err) {
      this.reportState("error", err instanceof Error ? err.message : String(err));
    }
  }

  start(): void {
    if (!this.gl || this.state !== "running") return;
    this.startTime = performance.now();
    this.lastFrame = this.startTime;
    this.tick();
  }

  setPhase(phase: Phase): void { this.phase = phase; }

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.resizeObserver?.disconnect();
    if (this.gl) {
      if (this.vao)         this.gl.deleteVertexArray(this.vao);
      if (this.vbo)         this.gl.deleteBuffer(this.vbo);
      if (this.ibo)         this.gl.deleteBuffer(this.ibo);
      if (this.instanceVbo) this.gl.deleteBuffer(this.instanceVbo);
      if (this.program)     this.gl.deleteProgram(this.program);
    }
    this.uniforms.clear();
    this.gl = null; this.template = null; this.data = null; this.state = "idle";
  }

  private tick(): void {
    if (!this.gl || !this.template || !this.data) return;
    const now = performance.now();
    const t   = (now - this.startTime) / 1000;
    this.frameCount++;
    if (this.frameCount % 30 === 0) { this.fps = Math.round(30000 / (now - this.lastFrame)); this.lastFrame = now; }
    this.render(t);
    this.rafId = requestAnimationFrame(() => this.tick());
  }

  private render(time: number): void {
    const gl       = this.gl!;
    const template = this.template!;
    const data     = this.data!;
    const params   = this.phase === PHASE_STUDENT ? data.studentParams : data.expertParams;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.031, 0.031, 0.063, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    this.setUniform1f("u_time",       time);
    this.setUniform1f("u_phase",      this.phase);
    this.setUniform2f("u_resolution", this.canvas.width, this.canvas.height);
    this.setUniformMat3("u_transform", IDENTITY_MAT3);
    for (const d of template.getUniforms(params, this.phase, time)) this.applyUniform(d);
    const call = template.drawCall(this.phase);
    if (call.instanceCount !== undefined) {
      if (call.indexed) gl.drawElementsInstanced(call.mode, call.count, gl.UNSIGNED_SHORT, 0, call.instanceCount);
      else              gl.drawArraysInstanced(call.mode, 0, call.count, call.instanceCount);
    } else if (call.indexed) {
      gl.drawElements(call.mode, call.count, gl.UNSIGNED_SHORT, 0);
    } else {
      gl.drawArrays(call.mode, 0, call.count);
    }
    gl.bindVertexArray(null);
  }

  private async compileProgram(vertSrc: string, fragSrc: string): Promise<void> {
    const gl = this.gl!;
    if (this.program) { gl.deleteProgram(this.program); this.program = null; }
    const vert = this.compileShader(gl.VERTEX_SHADER,   vertSrc);
    const frag = this.compileShader(gl.FRAGMENT_SHADER, fragSrc);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert); gl.attachShader(prog, frag); gl.linkProgram(prog);
    gl.deleteShader(vert); gl.deleteShader(frag);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error(`Shader link error: ${gl.getProgramInfoLog(prog)}`);
    this.program = prog;
    this.cacheUniformLocations();
  }

  private compileShader(type: number, src: string): WebGLShader {
    const gl = this.gl!;
    const s  = gl.createShader(type)!;
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(`Shader compile error: ${gl.getShaderInfoLog(s)}`);
    return s;
  }

  private cacheUniformLocations(): void {
    const gl = this.gl!;
    this.uniforms.clear();
    const names = ["u_time","u_phase","u_resolution","u_transform",
                   ...(this.template?.getUniforms({}, this.phase, 0).map(d => d.name) ?? [])];
    for (const name of names) {
      const loc = gl.getUniformLocation(this.program!, name);
      if (loc !== null) this.uniforms.set(name, loc);
    }
  }

  private buildGeometry(): void {
    // ── Guard: do nothing if template or data not yet loaded ─────────────────
    // ResizeObserver can fire before load() completes — this prevents the crash.
    if (!this.gl || !this.template || !this.data || !this.program) return;

    const gl       = this.gl;
    const template = this.template;
    const data     = this.data;
    const params   = this.phase === PHASE_STUDENT ? data.studentParams : data.expertParams;
    const geo      = template.buildGeometry(params, this.phase);
    if (this.vao) { gl.deleteVertexArray(this.vao); this.vao = null; }
    if (this.vbo) { gl.deleteBuffer(this.vbo);      this.vbo = null; }
    if (this.ibo) { gl.deleteBuffer(this.ibo);      this.ibo = null; }
    if (this.instanceVbo) { gl.deleteBuffer(this.instanceVbo); this.instanceVbo = null; }
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, geo.vertices, gl.STATIC_DRAW);
    this.bindAttribs(geo.attribs, 0);
    if (geo.instances && geo.instanceAttribs) {
      this.instanceVbo = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
      gl.bufferData(gl.ARRAY_BUFFER, geo.instances, gl.STREAM_DRAW);
      this.bindAttribs(geo.instanceAttribs, 1);
    }
    if (geo.indices) {
      this.ibo = gl.createBuffer()!;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.indices, gl.STATIC_DRAW);
    }
    gl.bindVertexArray(null);
  }

  private bindAttribs(attribs: AttribDescriptor[], divisor: number): void {
    const gl = this.gl!;
    for (const a of attribs) {
      const loc = gl.getAttribLocation(this.program!, a.name);
      if (loc < 0) continue;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, a.size, gl.FLOAT, false, a.stride, a.offset);
      gl.vertexAttribDivisor(loc, a.divisor !== undefined ? a.divisor : divisor > 0 ? divisor : 0);
    }
  }

  private setUniform1f(name: string, v: number): void { const l = this.uniforms.get(name); if (l) this.gl!.uniform1f(l, v); }
  private setUniform2f(name: string, x: number, y: number): void { const l = this.uniforms.get(name); if (l) this.gl!.uniform2f(l, x, y); }
  private setUniformMat3(name: string, m: Float32Array): void { const l = this.uniforms.get(name); if (l) this.gl!.uniformMatrix3fv(l, false, m); }

  private applyUniform(d: UniformDescriptor): void {
    const gl = this.gl!; const loc = this.uniforms.get(d.name); if (!loc) return;
    const v = d.value;
    switch (d.type) {
      case "1f":  gl.uniform1f(loc, v as number); break;
      case "2f":  gl.uniform2fv(loc, v as number[]); break;
      case "3f":  gl.uniform3fv(loc, v as number[]); break;
      case "4f":  gl.uniform4fv(loc, v as number[]); break;
      case "1i":  gl.uniform1i(loc, v as number); break;
      case "mat3":gl.uniformMatrix3fv(loc, false, v as number[]); break;
      case "mat4":gl.uniformMatrix4fv(loc, false, v as number[]); break;
    }
  }

  private setupViewport(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width  = this.canvas.clientWidth  * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.gl?.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  private watchResize(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.setupViewport();
      // Only rebuild geometry if fully loaded — template and data must both be ready
      if (this.gl && this.template && this.data && this.program) {
        this.buildGeometry();
      }
    });
    this.resizeObserver.observe(this.canvas);
  }

  private reportState(state: EngineState, error?: string): void {
    this.state = state;
    this.onStatus?.({ state, template: this.data?.hint ?? null, fps: this.fps, error });
  }
}

const IDENTITY_MAT3 = new Float32Array([1,0,0, 0,1,0, 0,0,1]);
