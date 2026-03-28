/**
 * src/simulation/templates/sort.ts
 * VEKTOR — Sorting Algorithm Visualizer (Pure Fragment Shader)
 *
 * YOUR MODEL  (phase=0): student's described algorithm (e.g. bubble sort)
 * EXPERT MODEL (phase=1): optimal algorithm (merge sort)
 *
 * Visual: animated bar chart, comparison highlights, swap animations,
 *         sorted bars glow green progressively
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
void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const fragmentShader = `#version 300 es
precision highp float;
in  vec2 v_uv;
out vec4 fragColor;

uniform float u_time;
uniform float u_phase;
uniform vec2  u_resolution;
uniform float u_array_size;
uniform float u_algorithm;   // 0=bubble, 1=insertion, 2=merge, 3=quick

const float PI = 3.14159265359;

// Pseudo-random
float hash(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5); }

// Get bar height [0,1] — fixed array seeded by phase
float barHeight(float idx) {
  // Different "starting arrays" for student vs expert
  float seed = u_phase < 0.5 ? 7.3 : 13.7;
  return 0.15 + hash(idx * seed + 0.5) * 0.80;
}

// Animate comparison: which two bars are being compared right now?
// Returns highlight intensity for bar at index idx
float compareHighlight(float idx, float t, float n) {
  float speed;
  if      (u_algorithm < 0.5) speed = 0.8;   // bubble: slow
  else if (u_algorithm < 1.5) speed = 1.2;   // insertion: medium
  else if (u_algorithm < 2.5) speed = 2.5;   // merge: fast
  else                        speed = 2.0;   // quick: fast

  // Current comparison index oscillates
  float step   = mod(t * speed, n);
  float stepI  = floor(step);
  float frac   = fract(step);

  // Bubble: compare adjacent pairs
  float cmp1 = mod(stepI, n - 1.0);
  float cmp2 = cmp1 + 1.0;
  float isCmp = smoothstep(0.3, 0.0, abs(idx - cmp1))
               + smoothstep(0.3, 0.0, abs(idx - cmp2));
  return clamp(isCmp, 0.0, 1.0) * (1.0 - frac * 0.3);
}

// Is this bar "sorted" (behind the current pass)?
float isSorted(float idx, float t, float n) {
  float speed = u_algorithm < 0.5 ? 0.8 : (u_algorithm < 1.5 ? 1.2 : 2.5);
  float pass  = floor(t * speed / n);  // how many passes completed
  // Bubble: sorted tail grows
  float sortedFrom = n - 1.0 - pass;
  return step(sortedFrom, idx);
}

void main() {
  vec2  uv = v_uv;
  float ar = u_resolution.x / u_resolution.y;

  float n  = clamp(u_array_size, 4.0, 16.0);
  float barW = 1.0 / n;

  // Which bar are we in?
  float barIdx  = floor(uv.x * n);
  float barFrac = fract(uv.x * n);

  float height  = barHeight(barIdx);
  float barGap  = 0.08;  // gap between bars as fraction of bar width

  // Phase colors
  vec3 baseCol   = u_phase < 0.5
    ? vec3(0.3, 0.4, 0.9)
    : vec3(0.2, 0.7, 0.4);
  vec3 cmpCol    = vec3(1.0, 0.8, 0.1);   // yellow: being compared
  vec3 sortedCol = vec3(0.2, 1.0, 0.5);   // green: sorted
  vec3 pivotCol  = vec3(1.0, 0.3, 0.8);   // pink: pivot (quicksort)

  // ── BACKGROUND ──────────────────────────────────────────────────────
  vec3 col = vec3(0.02, 0.02, 0.06);

  // ── HORIZONTAL GUIDE LINES ──────────────────────────────────────────
  float guide = smoothstep(0.008, 0.001, abs(fract(uv.y * 5.0) - 0.5) - 0.47);
  col += vec3(0.06, 0.06, 0.12) * guide;

  // ── BARS ────────────────────────────────────────────────────────────
  bool inBar = (barFrac > barGap * 0.5) && (barFrac < 1.0 - barGap * 0.5);
  if (inBar && uv.y < height) {
    float cmp  = compareHighlight(barIdx, u_time, n);
    float sort = isSorted(barIdx, u_time, n);

    // Vertical gradient within bar
    float grad = uv.y / height;

    vec3 barCol = baseCol;
    barCol = mix(barCol, cmpCol,    cmp);
    barCol = mix(barCol, sortedCol, sort);

    // Quicksort pivot
    if (u_algorithm > 2.5) {
      float pivotIdx = floor(mod(u_time * 1.5, n));
      float isPivot  = smoothstep(0.3, 0.0, abs(barIdx - pivotIdx));
      barCol = mix(barCol, pivotCol, isPivot);
    }

    // Darker at bottom, bright at top
    barCol = mix(barCol * 0.4, barCol + 0.1, grad);

    // Bar glow: highlight top edge
    float topEdge = smoothstep(0.025, 0.0, abs(uv.y - height));
    col = mix(col, barCol, 0.85);
    col += barCol * topEdge * 0.6;

    // Swap animation: bars briefly "lift" when being swapped
    float swapAnim = compareHighlight(barIdx, u_time + 0.1, n);
    col += barCol * swapAnim * 0.2;
  }

  // ── BAR OUTLINE (top cap glow) ────────────────────────────────────────
  if (inBar) {
    float topD = abs(uv.y - height);
    float cap  = smoothstep(0.012, 0.001, topD);
    float cmp  = compareHighlight(barIdx, u_time, n);
    vec3  capCol = mix(baseCol, cmpCol, cmp);
    col = mix(col, capCol + 0.4, cap * (uv.y > height - 0.02 ? 1.0 : 0.0));
  }

  // ── INDEX LABELS (tick marks at bottom) ──────────────────────────────
  float tickY = smoothstep(0.008, 0.001, abs(uv.y - 0.02));
  col += vec3(0.3, 0.3, 0.5) * tickY * 0.5;

  // ── ALGORITHM SPEED INDICATOR ─────────────────────────────────────────
  // Show a "progress bar" at top
  float progressWidth = clamp(mod(u_time * 0.15, 1.0), 0.0, 1.0);
  if (uv.y > 0.93) {
    float progress = step(uv.x, progressWidth);
    vec3  progCol  = u_phase < 0.5
      ? vec3(1.0, 0.3, 0.4) : vec3(0.5, 1.0, 0.4);
    col = mix(col, progCol, progress * 0.6);
  }

  // ── VIGNETTE ─────────────────────────────────────────────────────────
  vec2 vd = (uv - 0.5) * 2.0;
  col *= 1.0 - dot(vd, vd) * 0.18;

  fragColor = vec4(col, 1.0);
}`;

function buildGeometry(_p: SimParams, _ph: Phase): TemplateGeometry {
  const v = new Float32Array([-1,-1, 1,-1, -1,1, 1,-1, 1,1, -1,1]);
  return { vertices: v, attribs: [{ name: "a_pos", size: 2, offset: 0, stride: 8 }] };
}

function getUniforms(params: SimParams, phase: Phase, _t: number): UniformDescriptor[] {
  const s = phase === PHASE_STUDENT;
  const algMap: Record<string, number> = { bubble: 0, insertion: 1, merge: 2, quick: 3 };
  const alg = typeof params.algorithm === "string"
    ? (algMap[params.algorithm] ?? (s ? 0 : 2))
    : Number(params.algorithm ?? (s ? 0 : 2));
  return [
    { name: "u_array_size", type: "1f", value: Number(params.array_size ?? 8) },
    { name: "u_algorithm",  type: "1f", value: alg },
  ];
}

function drawCall(_: Phase): DrawCall { return { mode: 0x0004, count: 6 }; }

const sortTemplate: SimTemplate = {
  hint: "sort", label: "Sorting Algorithm",
  subjects: ["computer_science"],
  buildGeometry, getUniforms, drawCall, vertexShader, fragmentShader,
};
export default sortTemplate;
