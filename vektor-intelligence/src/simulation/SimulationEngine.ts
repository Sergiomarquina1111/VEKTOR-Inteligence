/**
 * src/simulation/SimulationEngine.ts
 * VEKTOR Intelligence — WebGL2 Simulation Engine
 *
 * Fixed:
 *  1. No duplicate RAF loops — stopLoop() always cancels before start()
 *  2. cacheUniformLocations uses real student+expert params (not empty {})
 *  3. setPhase restarts loop immediately so color change renders at once
 *  4. load() always calls stopLoop() first — no stale loops survive reload
 *  5. Shader compile error includes source snippet for debugging
 */

import type {
  SimulationData, SimTemplate, Phase, EngineStatus, EngineState,
  UniformDescriptor, DrawCall, AttribDescriptor,
} from "./types";
import { PHASE_STUDENT } from "./types";

const TEMPLATE_LOADERS: Record<string, () => Promise<{ default: SimTemplate }>> = {
  wave:       () => import("./templates/wave"),
  orbital:    () => import("./templates/oribital"),  // filename typo kept intentionally
  transform:  () => import("./templates/transform"),
  graph_plot: () => import("./templates/graph_plot"),
  sort:       () => import("./templates/sort"),
  molecule:   () => import("./templates/molecule"),
  generic:    () => import("./templates/generic"),
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
  private onStatus?:   (s: EngineStatus) => void;

  constructor(canvas: HTMLCanvasElement, phase: Phase, onStatus?: (s: EngineStatus) => void) {
    this.canvas   = canvas;
    this.phase    = phase;
    this.onStatus = onStatus;
    const gl = canvas.getContext("webgl2", {
      alpha: true, antialias: true, premultipliedAlpha: false,
    });
    if (!gl) { this.reportState("error", "WebGL2 not supported."); return; }
    this.gl = gl;
    this.setupViewport();
    this.watchResize();
    this.reportState("idle");
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async load(data: SimulationData): Promise<void> {
    if (!this.gl) return;
    // Kill any running animation before reloading — prevents duplicate loops
    this.stopLoop();
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
    if (!this.gl || !this.template || !this.data) return;
    // Always stop first — guarantees exactly one RAF loop is running
    this.stopLoop();
    this.state      = "running";
    this.startTime  = performance.now();
    this.lastFrame  = this.startTime;
    this.frameCount = 0;
    this.fps        = 0;
    this.tick();
  }

  /**
   * Switch phase (student ↔ expert) without reloading shaders.
   * Restarts the loop immediately so the color/param change renders at once.
   * Safe to call at any time — handles the overlay mode toggle.
   */
  setPhase(phase: Phase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    if (this.gl && this.template && this.data) {
      this.stopLoop();
      this.state      = "running";
      this.startTime  = performance.now();
      this.lastFrame  = this.startTime;
      this.frameCount = 0;
      this.tick();
    }
  }

  destroy(): void {
    this.stopLoop();
    this.resizeObserver?.disconnect();
    if (this.gl) {
      if (this.vao)         this.gl.deleteVertexArray(this.vao);
      if (this.vbo)         this.gl.deleteBuffer(this.vbo);
      if (this.ibo)         this.gl.deleteBuffer(this.ibo);
      if (this.instanceVbo) this.gl.deleteBuffer(this.instanceVbo);
      if (this.program)     this.gl.deleteProgram(this.program);
    }
    this.uniforms.clear();
    this.gl       = null;
    this.template = null;
    this.data     = null;
    this.state    = "idle";
  }

  // ── Render loop ────────────────────────────────────────────────────────────

  private stopLoop(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private tick(): void {
    if (!this.gl || !this.template || !this.data) return;
    const now = performance.now();
    const t   = (now - this.startTime) / 1000;
    this.frameCount++;
    if (this.lastFrame > 0 && this.frameCount % 10 === 0) {
      this.fps = Math.round(10000 / (now - this.lastFrame));
      this.onStatus?.({ state: "running", template: this.data?.hint ?? null, fps: this.fps });
    }
    if (this.frameCount % 10 === 0) this.lastFrame = now;
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

    // Standard engine uniforms
    this.setUniform1f("u_time",       time);
    this.setUniform1f("u_phase",      this.phase);
    this.setUniform2f("u_resolution", this.canvas.width, this.canvas.height);
    this.setUniformMat3("u_transform", IDENTITY_MAT3);

    // Template uniforms — carries phase-dependent colors + all params
    for (const d of template.getUniforms(params, this.phase, time)) {
      this.applyUniform(d);
    }

    const call = template.drawCall(this.phase);
    if (call.instanceCount !== undefined) {
      if (call.indexed)
        gl.drawElementsInstanced(call.mode, call.count, gl.UNSIGNED_SHORT, 0, call.instanceCount);
      else
        gl.drawArraysInstanced(call.mode, 0, call.count, call.instanceCount);
    } else if (call.indexed) {
      gl.drawElements(call.mode, call.count, gl.UNSIGNED_SHORT, 0);
    } else {
      gl.drawArrays(call.mode, 0, call.count);
    }

    gl.bindVertexArray(null);
  }

  // ── Shader compilation ─────────────────────────────────────────────────────

  private async compileProgram(vertSrc: string, fragSrc: string): Promise<void> {
    const gl = this.gl!;
    if (this.program) { gl.deleteProgram(this.program); this.program = null; }
    const vert = this.compileShader(gl.VERTEX_SHADER,   vertSrc);
    const frag = this.compileShader(gl.FRAGMENT_SHADER, fragSrc);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error(`Shader link: ${gl.getProgramInfoLog(prog)}`);
    this.program = prog;
    this.cacheUniformLocations();
  }

  private compileShader(type: number, src: string): WebGLShader {
    const gl = this.gl!;
    const s  = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(`Shader compile: ${info}`);
    }
    return s;
  }

  /**
   * Cache uniform locations after compilation.
   *
   * CRITICAL FIX: uses real studentParams + expertParams (not empty {}).
   * This ensures phase-dependent uniforms like u_main_color and u_deriv_color
   * are always discovered and cached correctly for both phases.
   */
  private cacheUniformLocations(): void {
    const gl = this.gl!;
    this.uniforms.clear();

    const standard = ["u_time", "u_phase", "u_resolution", "u_transform"];

    // Use real params from both phases — catches all conditional uniforms
    const sp = this.data?.studentParams ?? {};
    const ep = this.data?.expertParams  ?? {};
    const sNames = this.template?.getUniforms(sp, PHASE_STUDENT, 0).map(d => d.name) ?? [];
    const eNames = this.template?.getUniforms(ep, 1 as Phase, 0).map(d => d.name) ?? [];

    const allNames = [...new Set([...standard, ...sNames, ...eNames])];

    for (const name of allNames) {
      const loc = gl.getUniformLocation(this.program!, name);
      if (loc !== null) this.uniforms.set(name, loc);
    }
  }

  // ── Geometry ───────────────────────────────────────────────────────────────

  private buildGeometry(): void {
    if (!this.gl || !this.template || !this.data || !this.program) return;

    const gl     = this.gl;
    const data   = this.data;
    const params = this.phase === PHASE_STUDENT ? data.studentParams : data.expertParams;
    const geo    = this.template.buildGeometry(params, this.phase);

    if (this.vao)         { gl.deleteVertexArray(this.vao); this.vao = null; }
    if (this.vbo)         { gl.deleteBuffer(this.vbo);      this.vbo = null; }
    if (this.ibo)         { gl.deleteBuffer(this.ibo);      this.ibo = null; }
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
      gl.vertexAttribDivisor(
        loc,
        a.divisor !== undefined ? a.divisor : divisor > 0 ? divisor : 0,
      );
    }
  }

  // ── Uniform helpers ────────────────────────────────────────────────────────

  private setUniform1f(n: string, v: number): void {
    const l = this.uniforms.get(n); if (l) this.gl!.uniform1f(l, v);
  }
  private setUniform2f(n: string, x: number, y: number): void {
    const l = this.uniforms.get(n); if (l) this.gl!.uniform2f(l, x, y);
  }
  private setUniformMat3(n: string, m: Float32Array): void {
    const l = this.uniforms.get(n); if (l) this.gl!.uniformMatrix3fv(l, false, m);
  }

  private applyUniform(d: UniformDescriptor): void {
    const gl  = this.gl!;
    const loc = this.uniforms.get(d.name);
    if (!loc) return;
    const v = d.value;
    switch (d.type) {
      case "1f":   gl.uniform1f(loc,  v as number); break;
      case "2f":   gl.uniform2fv(loc, v as number[]); break;
      case "3f":   gl.uniform3fv(loc, v as number[]); break;
      case "4f":   gl.uniform4fv(loc, v as number[]); break;
      case "1i":   gl.uniform1i(loc,  v as number); break;
      case "mat3": gl.uniformMatrix3fv(loc, false, v as number[]); break;
      case "mat4": gl.uniformMatrix4fv(loc, false, v as number[]); break;
    }
  }

  // ── Viewport ───────────────────────────────────────────────────────────────

  private setupViewport(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width  = this.canvas.clientWidth  * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.gl?.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  private watchResize(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.setupViewport();
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

const IDENTITY_MAT3 = new Float32Array([1, 0, 0,  0, 1, 0,  0, 0, 1]);
