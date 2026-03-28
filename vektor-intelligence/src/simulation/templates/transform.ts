/**
 * src/simulation/templates/transform.ts
 * VEKTOR — Linear Transformation & Eigenvectors (Pure Fragment Shader)
 *
 * YOUR MODEL  (phase=0): student thinks eigenvectors rotate after transform
 * EXPERT MODEL (phase=1): eigenvectors only scale, direction preserved
 *
 * Visual: animated grid being transformed, eigenvector arrows staying put,
 *         unit circle deforming into ellipse
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
uniform float u_matrix_a;
uniform float u_matrix_b;
uniform float u_matrix_c;
uniform float u_matrix_d;
uniform float u_eigenval1;
uniform float u_eigenval2;
uniform float u_eigenvec1_x;
uniform float u_eigenvec1_y;
uniform float u_eigenvec2_x;
uniform float u_eigenvec2_y;
uniform float u_eigen_rotation;  // student misconception: eigenvectors rotate

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

// Apply 2x2 matrix transform
vec2 applyMatrix(vec2 v, float a, float b, float c, float d) {
  return vec2(a * v.x + b * v.y, c * v.x + d * v.y);
}

// Distance to line segment
float lineDist(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float t  = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  return length(p - (a + t * ab));
}

void main() {
  vec2  uv = v_uv;
  float ar = u_resolution.x / u_resolution.y;
  vec2  p  = vec2((uv.x - 0.5) * 3.0 * ar, (uv.y - 0.5) * 3.0);

  // Animation: t goes 0→1 (transform applied), then 1→0 (reset), looping
  float cycle = mod(u_time * 0.25, 2.0);
  float t = cycle < 1.0 ? cycle : 2.0 - cycle;
  t = t * t * (3.0 - 2.0 * t);  // smoothstep easing

  // Matrix elements (lerp from identity to full transform)
  float a = 1.0 + (u_matrix_a - 1.0) * t;
  float b = u_matrix_b * t;
  float c = u_matrix_c * t;
  float d = 1.0 + (u_matrix_d - 1.0) * t;

  // Inverse transform to find original grid coords
  float det   = a * d - b * c;
  float iDet  = 1.0 / (det + 0.0001);
  vec2  orig  = vec2(( d * p.x - b * p.y) * iDet,
                     (-c * p.x + a * p.y) * iDet);

  // Phase colors
  vec3 accentCol = u_phase < 0.5
    ? vec3(1.0, 0.239, 0.341)
    : vec3(0.784, 1.0, 0.0);

  // ── BACKGROUND ──────────────────────────────────────────────────────
  vec3 col = vec3(0.02, 0.02, 0.06);

  // ── TRANSFORMED GRID ────────────────────────────────────────────────
  // Grid lines in original space, drawn via inverse transform
  vec2 gridOrig = fract(orig * 1.0) - 0.5;
  float gridX   = smoothstep(0.03, 0.005, abs(gridOrig.x));
  float gridY   = smoothstep(0.03, 0.005, abs(gridOrig.y));
  col = mix(col, accentCol * 0.35, max(gridX, gridY) * 0.7);

  // Integer grid lines (axes)
  float axX = smoothstep(0.015, 0.002, abs(orig.x));
  float axY = smoothstep(0.015, 0.002, abs(orig.y));
  col = mix(col, vec3(0.5, 0.5, 0.8), max(axX, axY) * 0.6);

  // ── UNIT CIRCLE → ELLIPSE ────────────────────────────────────────────
  // Points on unit circle in original space, now transformed
  // Test if p is near the image of the unit circle
  float circDist = abs(length(orig) - 1.0);
  float circle   = smoothstep(0.04, 0.005, circDist);
  col = mix(col, vec3(0.2, 0.8, 1.0), circle * 0.6);

  // ── EIGENVECTORS ────────────────────────────────────────────────────
  vec2 ev1 = vec2(u_eigenvec1_x, u_eigenvec1_y);
  vec2 ev2 = vec2(u_eigenvec2_x, u_eigenvec2_y);

  // Student model: eigenvectors rotate by u_eigen_rotation
  if (u_phase < 0.5 && u_eigen_rotation > 0.01) {
    float rotAngle = u_eigen_rotation * t;
    float cr = cos(rotAngle); float sr = sin(rotAngle);
    ev1 = vec2(ev1.x * cr - ev1.y * sr, ev1.x * sr + ev1.y * cr);
    ev2 = vec2(ev2.x * cr - ev2.y * sr, ev2.x * sr + ev2.y * cr);
  }

  // Scale eigenvectors by eigenvalue (how far the matrix stretches them)
  float scale1 = 1.0 + (u_eigenval1 - 1.0) * t;
  float scale2 = 1.0 + (u_eigenval2 - 1.0) * t;
  vec2  ev1Scaled = ev1 * scale1;
  vec2  ev2Scaled = ev2 * scale2;

  // Draw eigenvector arrows
  float ev1D = lineDist(p, vec2(0.0), ev1Scaled);
  float ev2D = lineDist(p, vec2(0.0), ev2Scaled);
  float ev1Line = smoothstep(0.04, 0.005, ev1D);
  float ev2Line = smoothstep(0.04, 0.005, ev2D);
  col = mix(col, vec3(1.0, 0.9, 0.1), ev1Line * 0.9);   // yellow
  col = mix(col, vec3(1.0, 0.4, 0.9), ev2Line * 0.9);   // pink

  // Arrowheads
  float head1 = smoothstep(0.06, 0.001, length(p - ev1Scaled));
  float head2 = smoothstep(0.06, 0.001, length(p - ev2Scaled));
  col = mix(col, vec3(1.0, 0.95, 0.2), head1);
  col = mix(col, vec3(1.0, 0.5, 1.0), head2);

  // ── AXES ─────────────────────────────────────────────────────────────
  float xAx = smoothstep(0.008, 0.001, abs(p.y));
  float yAx = smoothstep(0.008 * ar, 0.001 * ar, abs(p.x));
  col = mix(col, vec3(0.4, 0.4, 0.6), max(xAx, yAx) * 0.5);

  // ── ORIGIN DOT ────────────────────────────────────────────────────────
  float orig_d = length(p);
  col = mix(col, vec3(1.0), smoothstep(0.04, 0.005, orig_d));

  // ── VIGNETTE ──────────────────────────────────────────────────────────
  vec2 vd = (uv - 0.5) * 2.0;
  col *= 1.0 - dot(vd, vd) * 0.25;

  fragColor = vec4(col, 1.0);
}`;

function buildGeometry(_p: SimParams, _ph: Phase): TemplateGeometry {
  const v = new Float32Array([-1,-1, 1,-1, -1,1, 1,-1, 1,1, -1,1]);
  return { vertices: v, attribs: [{ name: "a_pos", size: 2, offset: 0, stride: 8 }] };
}

function getUniforms(params: SimParams, _phase: Phase, _t: number): UniformDescriptor[] {
  return [
    { name: "u_matrix_a",       type: "1f", value: Number(params.matrix_a       ?? 2.0) },
    { name: "u_matrix_b",       type: "1f", value: Number(params.matrix_b       ?? 0.0) },
    { name: "u_matrix_c",       type: "1f", value: Number(params.matrix_c       ?? 0.0) },
    { name: "u_matrix_d",       type: "1f", value: Number(params.matrix_d       ?? 0.5) },
    { name: "u_eigenval1",      type: "1f", value: Number(params.eigenval1      ?? 2.0) },
    { name: "u_eigenval2",      type: "1f", value: Number(params.eigenval2      ?? 0.5) },
    { name: "u_eigenvec1_x",    type: "1f", value: Number(params.eigenvec1_x    ?? 1.0) },
    { name: "u_eigenvec1_y",    type: "1f", value: Number(params.eigenvec1_y    ?? 0.0) },
    { name: "u_eigenvec2_x",    type: "1f", value: Number(params.eigenvec2_x    ?? 0.0) },
    { name: "u_eigenvec2_y",    type: "1f", value: Number(params.eigenvec2_y    ?? 1.0) },
    { name: "u_eigen_rotation", type: "1f", value: Number(params.eigen_rotation ?? 0.0) },
  ];
}

function drawCall(_: Phase): DrawCall { return { mode: 0x0004, count: 6 }; }

const transformTemplate: SimTemplate = {
  hint: "transform", label: "Linear Transformation & Eigenvectors",
  subjects: ["mathematics"],
  buildGeometry, getUniforms, drawCall, vertexShader, fragmentShader,
};
export default transformTemplate;
