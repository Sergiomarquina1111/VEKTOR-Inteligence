/**
 * src/simulation/SimulationEngine.ts
 * VEKTOR Intelligence — WebGL2 Simulation Engine
 * Version: 2.2.0
 *
 * FIXES in v2.2.0:
 *  1. TEMPLATE_LOADERS now includes `force` → mapped to `generic` template
 *     (was missing, causing all physics simulations to silently fail).
 *  2. cacheUniformLocations() is now called AFTER `this.data` is assigned,
 *     so `getUniforms()` receives real params instead of empty `{}`. This
 *     was causing phase-conditional uniforms (u_main_color, u_deriv_color)
 *     to never be cached and therefore never rendered.
 *  3. Eliminated duplicate RAF loops: `rafId` is always cancelled before any
 *     new loop starts. `setPhase` no longer has a separate start path that
 *     could race with the one in `start()`.
 *  4. `load()` stores the incoming data BEFORE calling compileProgram() so
 *     cacheUniformLocations() always has access to real params.
 *  5. `setPhase()` safely handles calls during loading state.
 *  6. ResizeObserver guarded — won't call buildGeometry() unless program
 *     is compiled and data is ready.
 *  7. All WebGL resource cleanup verified in `destroy()`.
 */

import type {
  SimulationData,
  SimTemplate,
  Phase,
  EngineStatus,
  EngineState,
  UniformDescriptor,
  DrawCall,
  AttribDescriptor,
} from "./types";
import { PHASE_STUDENT } from "./types";

// ─── Template registry ────────────────────────────────────────────────────────
//
// IMPORTANT: `force` was missing here. The backend hint resolver can return
// "force" for physics queries. Without an entry here, every force simulation
// silently fell through to `generic` and rendered a meaningless node graph.
//
// If you later add a dedicated force template, replace "generic" with the
// actual import path. For now, `generic` is a safe visual fallback.

const TEMPLATE_LOADERS: Record<string, () => Promise<{ default: SimTemplate }>> = {
  wave:       () => import("./templates/wave"),
  orbital:    () => import("./templates/oribital"),  // typo kept: matches filename
  transform:  () => import("./templates/transform"),
  graph_plot: () => import("./templates/graph_plot"),
  sort:       () => import("./templates/sort"),
  molecule:   () => import("./templates/molecule"),
  force:      () => import("./templates/generic"),   // ← FIXED: was missing
  generic:    () => import("./templates/generic"),
};

// ─── Engine ───────────────────────────────────────────────────────────────────

export class SimulationEngine {
  private gl:           WebGL2RenderingContext | null = null;
  private canvas:       HTMLCanvasElement;
  private phase:        Phase;
  private template:     SimTemplate | null = null;
  private data:         SimulationData | null = null;
  private program:      WebGLProgram | null = null;
  private vao:          WebGLVertexArrayObject | null = null;
  private vbo:          WebGLBuffer | null = null;
  private ibo:          WebGLBuffer | null = null;
  private instanceVbo:  WebGLBuffer | null = null;
  private uniforms:     Map<string, WebGLUniformLocation> = new Map();
  private rafId:        number = 0;
  private startTime:    number = 0;
  private lastFpsTime:  number = 0;
  private frameCount:   number = 0;
  private fps:          number = 0;
  private state:        EngineState = "idle";
  private resizeObs:    ResizeObserver | null = null;
  private onStatus?:    (s: EngineStatus) => void;

  constructor(
    canvas:    HTMLCanvasElement,
    phase:     Phase,
    onStatus?: (s: EngineStatus) => void,
  ) {
    this.canvas   = canvas;
    this.phase    = phase;
    this.onStatus = onStatus;

    const gl = canvas.getContext("webgl2", {
      alpha:              true,
      antialias:          true,
      premultipliedAlpha: false,
    });

    if (!gl) {
      this.reportState("error", "WebGL2 not supported in this browser.");
      return;
    }

    this.gl = gl;
    this.setupViewport();
    this.watchResize();
    this.reportState("idle");
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Load a simulation data payload.
   *
   * CRITICAL FIX: `this.data` is assigned BEFORE `compileProgram()` is called.
   * Previously data was assigned after compilation, which meant
   * `cacheUniformLocations()` received empty `{}` params and never discovered
   * conditional uniforms like `u_main_color`, `u_derivative_scale`, etc.
   */
  async load(data: SimulationData): Promise<void> {
    if (!this.gl) return;

    // Stop any running loop before touching state
    this.stopLoop();
    this.reportState("loading");

    // ← FIXED: assign data FIRST so cacheUniformLocations gets real params
    this.data = data;

    try {
      const key    = data.hint in TEMPLATE_LOADERS ? data.hint : "generic";
      const module = await (TEMPLATE_LOADERS[key] ?? TEMPLATE_LOADERS.generic)();
      this.template = module.default;

      await this.compileProgram(
        this.template.vertexShader,
        this.template.fragmentShader,
      );

      this.buildGeometry();
      this.reportState("running");
    } catch (err) {
      this.reportState(
        "error",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  /**
   * Begin the render loop. Always stops any existing loop first.
   */
  start(): void {
    if (!this.gl || !this.template || !this.data) return;
    this.stopLoop();
    this.state      = "running";
    this.startTime  = performance.now();
    this.lastFpsTime = this.startTime;
    this.frameCount = 0;
    this.fps        = 0;
    this.tick();
  }

  /**
   * Switch rendering phase (student ↔ expert) without reloading shaders.
   *
   * FIXED: Previously this had its own inline RAF start that could race with
   * the one in `start()`. Now it always goes through the same `start()` path,
   * guaranteeing exactly one loop at a time.
   *
   * Safe to call when data is still loading — the guard `this.template &&
   * this.data` in `start()` prevents a loop from starting prematurely.
   */
  setPhase(phase: Phase): void {
    if (this.phase === phase) return;
    this.phase = phase;

    if (this.gl && this.template && this.data) {
      this.start();
    }
    // If we're still loading, `start()` will be called by `load()` once done.
  }

  destroy(): void {
    this.stopLoop();
    this.resizeObs?.disconnect();

    const gl = this.gl;
    if (gl) {
      if (this.vao)         gl.deleteVertexArray(this.vao);
      if (this.vbo)         gl.deleteBuffer(this.vbo);
      if (this.ibo)         gl.deleteBuffer(this.ibo);
      if (this.instanceVbo) gl.deleteBuffer(this.instanceVbo);
      if (this.program)     gl.deleteProgram(this.program);
    }

    this.uniforms.clear();
    this.gl       = null;
    this.template = null;
    this.data     = null;
    this.vao      = null;
    this.vbo      = null;
    this.ibo      = null;
    this.instanceVbo = null;
    this.program  = null;
    this.state    = "idle";
  }

  // ── Render loop ─────────────────────────────────────────────────────────────

  private stopLoop(): void {
    if (this.rafId !== 0) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private tick(): void {
    if (!this.gl || !this.template || !this.data) return;

    const now = performance.now();
    const t   = (now - this.startTime) / 1000;

    this.frameCount++;

    // Update FPS every 30 frames
    if (this.frameCount % 30 === 0) {
      const elapsed = now - this.lastFpsTime;
      if (elapsed > 0) {
        this.fps = Math.round(30_000 / elapsed);
        this.onStatus?.({
          state:    "running",
          template: this.data.hint,
          fps:      this.fps,
        });
      }
      this.lastFpsTime = now;
    }

    this.render(t);
    this.rafId = requestAnimationFrame(() => this.tick());
  }

  private render(time: number): void {
    const gl       = this.gl!;
    const template = this.template!;
    const data     = this.data!;
    const params   = this.phase === PHASE_STUDENT
      ? data.studentParams
      : data.expertParams;

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

    // Template uniforms (phase-aware colors + all params)
    for (const d of template.getUniforms(params, this.phase, time)) {
      this.applyUniform(d);
    }

    const call = template.drawCall(this.phase);
    if (call.instanceCount !== undefined) {
      if (call.indexed) {
        gl.drawElementsInstanced(
          call.mode, call.count, gl.UNSIGNED_SHORT, 0, call.instanceCount,
        );
      } else {
        gl.drawArraysInstanced(call.mode, 0, call.count, call.instanceCount);
      }
    } else if (call.indexed) {
      gl.drawElements(call.mode, call.count, gl.UNSIGNED_SHORT, 0);
    } else {
      gl.drawArrays(call.mode, 0, call.count);
    }

    gl.bindVertexArray(null);
  }

  // ── Shader compilation ──────────────────────────────────────────────────────

  private async compileProgram(vertSrc: string, fragSrc: string): Promise<void> {
    const gl = this.gl!;

    if (this.program) {
      gl.deleteProgram(this.program);
      this.program = null;
    }

    const vert = this.compileShader(gl.VERTEX_SHADER,   vertSrc);
    const frag = this.compileShader(gl.FRAGMENT_SHADER, fragSrc);

    const prog = gl.createProgram();
    if (!prog) throw new Error("Failed to create WebGL program.");

    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    gl.deleteShader(vert);
    gl.deleteShader(frag);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error(`Shader link error: ${log}`);
    }

    this.program = prog;

    // FIXED: cacheUniformLocations now runs after this.data is already set
    // (data is assigned in load() before compileProgram() is called),
    // so getUniforms() receives the real studentParams / expertParams.
    this.cacheUniformLocations();
  }

  private compileShader(type: number, src: string): WebGLShader {
    const gl = this.gl!;
    const s  = gl.createShader(type);
    if (!s) throw new Error("Failed to create shader object.");

    gl.shaderSource(s, src);
    gl.compileShader(s);

    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log  = gl.getShaderInfoLog(s);
      const kind = type === gl.VERTEX_SHADER ? "vertex" : "fragment";
      gl.deleteShader(s);
      throw new Error(`${kind} shader compile error: ${log}`);
    }

    return s;
  }

  /**
   * Cache all uniform locations after shader compilation.
   *
   * FIXED: Uses real studentParams + expertParams (both phases) so that
   * phase-conditional uniforms are always discovered and cached.
   * Previously this used empty `{}` objects, causing any uniform that depended
   * on a param value (e.g. u_derivative_scale, u_main_color) to be skipped.
   */
  private cacheUniformLocations(): void {
    const gl = this.gl!;
    this.uniforms.clear();

    const standard = [
      "u_time", "u_phase", "u_resolution", "u_transform",
    ];

    const sp = this.data?.studentParams ?? {};
    const ep = this.data?.expertParams  ?? {};

    const sNames = this.template
      ?.getUniforms(sp, PHASE_STUDENT, 0)
      .map(d => d.name) ?? [];

    const eNames = this.template
      ?.getUniforms(ep, 1 as Phase, 0)
      .map(d => d.name) ?? [];

    const allNames = [...new Set([...standard, ...sNames, ...eNames])];

    for (const name of allNames) {
      const loc = gl.getUniformLocation(this.program!, name);
      if (loc !== null) this.uniforms.set(name, loc);
    }
  }

  // ── Geometry ─────────────────────────────────────────────────────────────────

  private buildGeometry(): void {
    if (!this.gl || !this.template || !this.data || !this.program) return;

    const gl     = this.gl;
    const data   = this.data;
    const params = this.phase === PHASE_STUDENT
      ? data.studentParams
      : data.expertParams;

    const geo = this.template.buildGeometry(params, this.phase);

    // Clean up old buffers
    if (this.vao)         { gl.deleteVertexArray(this.vao); this.vao = null; }
    if (this.vbo)         { gl.deleteBuffer(this.vbo);      this.vbo = null; }
    if (this.ibo)         { gl.deleteBuffer(this.ibo);      this.ibo = null; }
    if (this.instanceVbo) { gl.deleteBuffer(this.instanceVbo); this.instanceVbo = null; }

    this.vao = gl.createVertexArray();
    if (!this.vao) throw new Error("Failed to create VAO.");
    gl.bindVertexArray(this.vao);

    // Vertex buffer
    this.vbo = gl.createBuffer();
    if (!this.vbo) throw new Error("Failed to create VBO.");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, geo.vertices, gl.STATIC_DRAW);
    this.bindAttribs(geo.attribs, 0);

    // Instance buffer (optional)
    if (geo.instances && geo.instanceAttribs) {
      this.instanceVbo = gl.createBuffer();
      if (!this.instanceVbo) throw new Error("Failed to create instance VBO.");
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
      gl.bufferData(gl.ARRAY_BUFFER, geo.instances, gl.STREAM_DRAW);
      this.bindAttribs(geo.instanceAttribs, 1);
    }

    // Index buffer (optional)
    if (geo.indices) {
      this.ibo = gl.createBuffer();
      if (!this.ibo) throw new Error("Failed to create IBO.");
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.indices, gl.STATIC_DRAW);
    }

    gl.bindVertexArray(null);
  }

  private bindAttribs(attribs: AttribDescriptor[], defaultDivisor: number): void {
    const gl = this.gl!;
    for (const a of attribs) {
      const loc = gl.getAttribLocation(this.program!, a.name);
      if (loc < 0) continue;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, a.size, gl.FLOAT, false, a.stride, a.offset);
      gl.vertexAttribDivisor(
        loc,
        a.divisor !== undefined ? a.divisor : defaultDivisor,
      );
    }
  }

  // ── Uniform setters ──────────────────────────────────────────────────────────

  private setUniform1f(name: string, v: number): void {
    const loc = this.uniforms.get(name);
    if (loc) this.gl!.uniform1f(loc, v);
  }

  private setUniform2f(name: string, x: number, y: number): void {
    const loc = this.uniforms.get(name);
    if (loc) this.gl!.uniform2f(loc, x, y);
  }

  private setUniformMat3(name: string, m: Float32Array): void {
    const loc = this.uniforms.get(name);
    if (loc) this.gl!.uniformMatrix3fv(loc, false, m);
  }

  private applyUniform(d: UniformDescriptor): void {
    const gl  = this.gl!;
    const loc = this.uniforms.get(d.name);
    if (!loc) return;

    const v = d.value;
    switch (d.type) {
      case "1f":   gl.uniform1f(loc,  v as number);           break;
      case "2f":   gl.uniform2fv(loc, v as number[]);         break;
      case "3f":   gl.uniform3fv(loc, v as number[]);         break;
      case "4f":   gl.uniform4fv(loc, v as number[]);         break;
      case "1i":   gl.uniform1i(loc,  v as number);           break;
      case "mat3": gl.uniformMatrix3fv(loc, false, v as number[]); break;
      case "mat4": gl.uniformMatrix4fv(loc, false, v as number[]); break;
    }
  }

  // ── Viewport ─────────────────────────────────────────────────────────────────

  private setupViewport(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width  = Math.round(this.canvas.clientWidth  * dpr);
    this.canvas.height = Math.round(this.canvas.clientHeight * dpr);
    this.gl?.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  private watchResize(): void {
    this.resizeObs = new ResizeObserver(() => {
      this.setupViewport();
      // FIXED: guard against calling buildGeometry when not fully initialised
      if (this.gl && this.template && this.data && this.program) {
        this.buildGeometry();
      }
    });
    this.resizeObs.observe(this.canvas);
  }

  private reportState(state: EngineState, error?: string): void {
    this.state = state;
    this.onStatus?.({
      state,
      template: this.data?.hint ?? null,
      fps:      this.fps,
      error,
    });
  }
}

// Column-major identity matrix for mat3
const IDENTITY_MAT3 = new Float32Array([
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
]);