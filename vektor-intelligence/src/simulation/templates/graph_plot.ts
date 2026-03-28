/**
 * src/simulation/templates/graph_plot.ts
 * VEKTOR Intelligence — Animated Function Graph (Pure Fragment Shader)
 *
 * Renders everything analytically in the fragment shader — fullscreen quad.
 *
 * Animation (matches Java reference):
 *  - f(x) curve — glowing colored line
 *  - Shaded fill area grows from left to right as time progresses
 *  - Yellow dot travels along the curve
 *  - Cyan tangent line follows the dot (shows derivative)
 *  - Grid + axes
 *
 * u_phase = 0 (YOUR MODEL):  tangent hidden — student doesn't see derivative
 * u_phase = 1 (EXPERT MODEL): tangent visible, correct derivative shown
 */

import type {
  SimTemplate, SimParams, Phase,
  TemplateGeometry, UniformDescriptor, DrawCall,
} from "../types";
import { PHASE_STUDENT } from "../types";

// ── Vertex shader: fullscreen quad ───────────────────────────────────────────
const vertexShader = `#version 300 es
precision highp float;
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv        = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// ── Fragment shader ───────────────────────────────────────────────────────────
const fragmentShader = `#version 300 es
precision highp float;

in  vec2 v_uv;
out vec4 fragColor;

uniform float u_time;
uniform float u_phase;
uniform vec2  u_resolution;
uniform float u_func_type;
uniform float u_amplitude;
uniform float u_frequency;
uniform float u_x_offset;
uniform float u_show_derivative;
uniform float u_derivative_scale;

const float PI = 3.14159265359;

float evalF(float t) {
  float xn = (t * 2.0 - 1.0) * PI * u_frequency + u_x_offset;
  float v;
  if      (u_func_type < 0.5) v = sin(xn);
  else if (u_func_type < 1.5) { float k = xn / PI; v = k*k*k - k; }
  else if (u_func_type < 2.5) v = exp(-xn * xn * 0.5) - 0.3;
  else                        v = abs(xn / PI) - 0.5;
  return clamp(v * u_amplitude, -0.95, 0.95);
}

float evalDF(float t) {
  float h = 0.003;
  return (evalF(t + h) - evalF(t - h)) / (2.0 * h);
}

void main() {
  vec2  uv   = v_uv;                              // [0,1]²
  float ar   = u_resolution.x / u_resolution.y;

  // World space: x ∈ [-ar, ar],  y ∈ [-1, 1]
  float wx = (uv.x - 0.5) * 2.0 * ar;
  float wy = (uv.y - 0.5) * 2.0;

  // t ∈ [0,1] for current column
  float t      = uv.x;

  // Animated point: 5s cycle
  float tAnim  = mod(u_time * 0.20, 1.0);

  // Phase colors
  vec3 curveCol = u_phase < 0.5
    ? vec3(1.0, 0.239, 0.341)    // coral — student
    : vec3(0.784, 1.0, 0.0);     // lime  — expert

  // ── BACKGROUND ──────────────────────────────────────────────────────────
  vec3 col = vec3(0.031, 0.031, 0.063);

  // ── GRID ─────────────────────────────────────────────────────────────────
  vec2 grid = abs(fract(uv * 8.0) - 0.5);
  float gl  = max(smoothstep(0.48, 0.5, grid.x), smoothstep(0.48, 0.5, grid.y));
  col += vec3(0.05, 0.05, 0.10) * gl;

  // ── AXES ─────────────────────────────────────────────────────────────────
  float axH = smoothstep(0.007, 0.001, abs(wy));          // horizontal
  float axV = smoothstep(0.007 * ar, 0.001 * ar, abs(wx)); // vertical
  col = mix(col, vec3(0.4, 0.4, 0.6), max(axH, axV) * 0.8);

  // ── FILL AREA (grows left to right with animation) ────────────────────
  float fY   = evalF(t) * 0.72;   // curve y in world coords
  float inX  = step(t, tAnim);    // only columns left of animated point
  // Check if pixel is between y=0 and fY
  float inY  = (fY >= 0.0)
    ? step(0.0, wy) * step(wy, fY)
    : step(fY, wy)  * step(wy, 0.0);
  col = mix(col, curveCol, inX * inY * 0.20);

  // ── CURVE ─────────────────────────────────────────────────────────────────
  float cY     = evalF(t) * 0.72;
  float distY  = abs(wy - cY);
  float curve  = smoothstep(0.035, 0.003, distY);
  float cglow  = smoothstep(0.12,  0.0,   distY) * 0.25;
  col = mix(col, curveCol,        cglow);
  col = mix(col, curveCol + 0.25, curve);

  // ── TANGENT LINE ─────────────────────────────────────────────────────────
  if (u_show_derivative > 0.5) {
    float slope   = evalDF(tAnim) * u_derivative_scale;
    float animWX  = (tAnim - 0.5) * 2.0 * ar;
    float animWY  = evalF(tAnim) * 0.72;
    // Line: wy = animWY + slope * (wx - animWX)  (note: slope in t-space, convert)
    float tangWY  = animWY + slope * (wx - animWX) * 0.72;
    float dTang   = abs(wy - tangWY);
    // Only draw tangent within ±0.35 of the dot in x
    float inRange = step(abs(wx - animWX), 0.35 * ar);
    float tang    = smoothstep(0.025, 0.003, dTang) * inRange;
    vec3  tc      = vec3(0.0, 0.898, 1.0);
    col = mix(col, tc + 0.15, tang * 0.95);
    col += tc * smoothstep(0.06, 0.0, dTang) * inRange * 0.12;
  }

  // ── ANIMATED DOT ─────────────────────────────────────────────────────────
  float dotWX  = (tAnim - 0.5) * 2.0 * ar;
  float dotWY  = evalF(tAnim) * 0.72;
  float dotD   = length(vec2(wx - dotWX, wy - dotWY));
  float dotR   = 0.035;
  float dot_   = smoothstep(dotR, dotR * 0.4, dotD);
  float pulse  = 0.65 + 0.35 * sin(u_time * 7.0);
  col = mix(col, vec3(1.0, 0.92, 0.1), dot_);
  col += vec3(1.0, 0.85, 0.0) * smoothstep(dotR * 3.5, 0.0, dotD) * 0.35 * pulse;

  // ── VIGNETTE ─────────────────────────────────────────────────────────────
  vec2 vd  = (uv - 0.5) * 2.0;
  col     *= 1.0 - dot(vd, vd) * 0.22;

  fragColor = vec4(col, 1.0);
}`;

// ── Geometry: fullscreen quad (2 triangles) ───────────────────────────────────
function buildGeometry(_p: SimParams, _ph: Phase): TemplateGeometry {
  const v = new Float32Array([
    -1, -1,   1, -1,   -1,  1,
     1, -1,   1,  1,   -1,  1,
  ]);
  return {
    vertices: v,
    attribs: [{ name: "a_pos", size: 2, offset: 0, stride: 8 }],
  };
}

// ── Uniforms ──────────────────────────────────────────────────────────────────
function getUniforms(params: SimParams, phase: Phase, _t: number): UniformDescriptor[] {
  const s = phase === PHASE_STUDENT;
  return [
    { name: "u_func_type",        type: "1f", value: Number(params.func_type        ?? 1) },
    { name: "u_amplitude",        type: "1f", value: Number(params.amplitude        ?? 1.0) },
    { name: "u_frequency",        type: "1f", value: Number(params.frequency        ?? 1.0) },
    { name: "u_x_offset",         type: "1f", value: Number(params.x_offset         ?? 0.0) },
    // Student model: tangent hidden (they don't see the derivative)
    // Expert model:  tangent visible
    { name: "u_show_derivative",  type: "1f", value: Number(params.show_derivative  ?? (s ? 0 : 1)) },
    { name: "u_derivative_scale", type: "1f", value: Number(params.derivative_scale ?? 1.0) },
  ];
}

// ── Draw: 6 vertices, TRIANGLES ───────────────────────────────────────────────
function drawCall(_ph: Phase): DrawCall {
  return { mode: 0x0004 /* gl.TRIANGLES */, count: 6 };
}

const graphPlotTemplate: SimTemplate = {
  hint:     "graph_plot",
  label:    "Function Graph",
  subjects: ["mathematics"],
  buildGeometry,
  getUniforms,
  drawCall,
  vertexShader,
  fragmentShader,
};
export default graphPlotTemplate;
