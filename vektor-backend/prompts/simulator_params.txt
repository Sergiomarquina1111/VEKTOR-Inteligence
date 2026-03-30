/**
 * src/simulation/templates/graph_plot.ts
 * VEKTOR — Function & Derivative Simulation (Pure Fragment Shader)
 *
 * BOTH canvases show the SAME f(x) curve.
 * The ONLY visual difference is the derivative curve:
 *
 * YOUR MODEL  (coral) — student's wrong derivative
 *   derivative_scale < 1.0 → shallower curve (e.g. thinks d/dx(x²) = x)
 *   derivative_scale > 1.0 → steeper curve
 *   show_derivative = 0    → no derivative shown at all
 *
 * EXPERT MODEL (lime) — correct derivative
 *   derivative_scale = 1.0
 *   show_derivative  = 1
 *   Cyan derivative curve follows the correct mathematical slope
 */

import type {
  SimTemplate, SimParams, Phase,
  TemplateGeometry, UniformDescriptor, DrawCall,
} from "../types";
import { PHASE_STUDENT } from "../types";

const vertexShader = `#version 300 es
precision highp float;
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const fragmentShader = `#version 300 es
precision highp float;
in  vec2 v_uv;
out vec4 fragColor;

uniform float u_time;
uniform float u_phase;         // 0 = student (coral), 1 = expert (lime)
uniform vec2  u_resolution;
uniform float u_func_type;
uniform float u_amplitude;
uniform float u_frequency;
uniform float u_x_offset;
uniform float u_derivative_scale;
uniform float u_show_derivative;

const float PI = 3.14159265359;

// f(x) — same on both canvases
float evalF(float t) {
  float xn = (t * 2.0 - 1.0) * PI * u_frequency + u_x_offset;
  float v;
  if      (u_func_type < 0.5) v = sin(xn);
  else if (u_func_type < 1.5) { float k = xn / PI; v = k*k*k - k; }
  else if (u_func_type < 2.5) { float k = xn / PI; v = k * k; }
  else                        { v = abs(xn / PI) - 0.5; }
  return clamp(v * u_amplitude, -1.0, 1.0);
}

// True derivative via central difference
float trueDF(float t) {
  float h = 0.003;
  return (evalF(t + h) - evalF(t - h)) / (2.0 * h);
}

void main() {
  vec2  uv  = v_uv;
  float ar  = u_resolution.x / u_resolution.y;
  float t   = uv.x;
  float wy  = (uv.y - 0.5) * 2.0;

  bool  isExpert = u_phase > 0.5;

  // Animated point 0→1 every 5 seconds
  float tAnim = mod(u_time * 0.20, 1.0);

  // f(x) values
  float fY      = evalF(t) * 0.55;
  float fAnimY  = evalF(tAnim) * 0.55;

  // Derivative values
  float dfTrue  = trueDF(t) * 0.28;          // correct derivative curve
  float dfScaled = dfTrue * u_derivative_scale; // student's believed derivative

  // Which derivative to show on this canvas
  float derivY  = isExpert ? dfTrue : dfScaled;

  // Colors
  vec3 mainCol  = isExpert ? vec3(0.784, 1.0, 0.0) : vec3(1.0, 0.239, 0.341);
  vec3 derivCol = vec3(0.0, 0.898, 1.0);    // cyan for derivative on both

  // ── BACKGROUND ──────────────────────────────────────────────────────
  vec3 col = vec3(0.022, 0.022, 0.055);

  // ── GRID ────────────────────────────────────────────────────────────
  vec2 gp = abs(fract(uv * vec2(8.0, 6.0)) - 0.5);
  float gline = max(smoothstep(0.47, 0.50, gp.x), smoothstep(0.47, 0.50, gp.y));
  col += vec3(0.04, 0.04, 0.09) * gline;

  // ── AXES ────────────────────────────────────────────────────────────
  col = mix(col, vec3(0.30, 0.30, 0.50),
    max(smoothstep(0.006, 0.001, abs(wy)),
        smoothstep(0.006, 0.001, abs(uv.x - 0.5))) * 0.7);

  // ── FILL AREA under f(x) (grows left with animation) ────────────────
  float fillMask = step(t, tAnim);
  float belowF = fY >= 0.0
    ? step(0.0, wy) * step(wy, fY)
    : step(fY, wy)  * step(wy, 0.0);
  col = mix(col, mainCol, fillMask * belowF * 0.18);

  // ── MAIN CURVE f(x) ─────────────────────────────────────────────────
  float dF    = abs(wy - fY);
  float fLine = smoothstep(0.032, 0.003, dF);
  float fGlow = smoothstep(0.13,  0.000, dF) * 0.30;
  col = mix(col, mainCol,        fGlow);
  col = mix(col, mainCol + 0.15, fLine);

  // ── DERIVATIVE CURVE ────────────────────────────────────────────────
  if (u_show_derivative > 0.5) {
    float dD    = abs(wy - derivY);
    float dLine = smoothstep(0.024, 0.003, dD);
    float dGlow = smoothstep(0.10,  0.000, dD) * 0.22;

    // Student derivative: dashed to signal "this is what you believe"
    float solid = isExpert ? 1.0 : step(0.45, fract(t * 10.0));
    col = mix(col, derivCol,        dGlow);
    col = mix(col, derivCol + 0.10, dLine * solid);
  }

  // ── TANGENT LINE at animated dot ─────────────────────────────────────
  {
    float slope   = trueDF(tAnim) * u_derivative_scale * 0.55;
    float animWX  = (tAnim - 0.5) * 2.0 * ar;
    float wx      = (uv.x - 0.5) * 2.0 * ar;
    float tangY   = fAnimY + slope * (wx - animWX);

    // Clip BOTH horizontally (fixed range around dot) AND vertically.
    // Without the Y-clip, steep derivatives on the expert canvas (derivative_scale=1.0)
    // shoot the tangent line far below/above the visible area — looks like a bug.
    // The student canvas (derivative_scale=0.5) stays in bounds but expert doesn't.
    float inRangeX = step(abs(wx - animWX), 0.38 * ar);
    float inRangeY = step(abs(tangY), 0.92);   // clip at ±92% canvas height
    float inRange  = inRangeX * inRangeY;

    float dTang   = abs(wy - tangY);
    float tLine   = smoothstep(0.018, 0.003, dTang) * inRange;
    col = mix(col, derivCol + 0.15, tLine * 0.9);
    col += derivCol * smoothstep(0.06, 0.0, dTang) * inRange * 0.15;
  }

  // ── ANIMATED DOT ─────────────────────────────────────────────────────
  {
    float dotWX = (tAnim - 0.5) * 2.0 * ar;
    float wx    = (uv.x - 0.5) * 2.0 * ar;
    float dotD  = length(vec2(wx - dotWX, wy - fAnimY));
    float pulse = 0.65 + 0.35 * sin(u_time * 7.0);
    col = mix(col, vec3(1.0, 0.92, 0.1), smoothstep(0.030, 0.003, dotD));
    col += vec3(1.0, 0.85, 0.0) * smoothstep(0.09, 0.0, dotD) * 0.35 * pulse;
  }

  // ── VIGNETTE ────────────────────────────────────────────────────────
  vec2 vd = (uv - 0.5) * 2.0;
  col *= 1.0 - dot(vd, vd) * 0.22;

  fragColor = vec4(col, 1.0);
}`;

function buildGeometry(_p: SimParams, _ph: Phase): TemplateGeometry {
  const v = new Float32Array([-1,-1, 1,-1, -1,1, 1,-1, 1,1, -1,1]);
  return { vertices: v, attribs: [{ name: "a_pos", size: 2, offset: 0, stride: 8 }] };
}

function getUniforms(params: SimParams, phase: Phase, _t: number): UniformDescriptor[] {
  const s = phase === PHASE_STUDENT;
  return [
    { name: "u_func_type",        type: "1f", value: Number(params.func_type        ?? 2)   },
    { name: "u_amplitude",        type: "1f", value: Number(params.amplitude        ?? 1.0) },
    { name: "u_frequency",        type: "1f", value: Number(params.frequency        ?? 0.8) },
    { name: "u_x_offset",         type: "1f", value: Number(params.x_offset         ?? 0.0) },
    { name: "u_derivative_scale", type: "1f", value: Number(params.derivative_scale ?? (s ? 0.5 : 1.0)) },
    { name: "u_show_derivative",  type: "1f", value: Number(params.show_derivative  ?? 1)   },
  ];
}

function drawCall(_ph: Phase): DrawCall {
  return { mode: 0x0004, count: 6 };
}

const graphPlotTemplate: SimTemplate = {
  hint: "graph_plot", label: "Function & Derivative",
  subjects: ["mathematics"],
  buildGeometry, getUniforms, drawCall, vertexShader, fragmentShader,
};
export default graphPlotTemplate;