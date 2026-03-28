/**
 * src/simulation/templates/generic.ts
 * VEKTOR — Universal Concept Network Simulation (Pure Fragment Shader)
 *
 * YOUR MODEL  (phase=0): flat/shallow concept structure (student's understanding)
 * EXPERT MODEL (phase=1): deep hierarchical network (expert understanding)
 *
 * Visual: animated floating nodes connected by pulsing edges,
 *         nodes orbit a central concept, connections ripple with energy
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
uniform float u_node_count;
uniform float u_hierarchy;
uniform float u_complexity;

const float PI  = 3.14159265359;
const float TAU = 6.28318530718;

float hash(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5); }
float hash2(float n) { return fract(sin(n * 269.5 + 183.3) * 43758.5); }

// Soft glowing node
float node(vec2 p, vec2 c, float r) {
  float d = length(p - c);
  return smoothstep(r, r * 0.2, d) + smoothstep(r * 3.0, 0.0, d) * 0.3;
}

// Glowing connection line
float edge(vec2 p, vec2 a, vec2 b, float width) {
  vec2  ab = b - a;
  float t  = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  float d  = length(p - (a + t * ab));
  // Pulse along edge
  return smoothstep(width, width * 0.2, d);
}

// Pulse travelling along an edge (0..1 position)
float edgePulse(vec2 p, vec2 a, vec2 b, float t_pulse) {
  vec2  ab  = b - a;
  float len = length(ab);
  float t   = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  float d   = length(p - (a + t * ab));
  float along = t - t_pulse;
  float pulse = exp(-along * along * 80.0) * exp(-d * 40.0);
  return pulse;
}

void main() {
  vec2  uv = v_uv;
  float ar = u_resolution.x / u_resolution.y;
  vec2  p  = vec2((uv.x - 0.5) * 2.0 * ar, (uv.y - 0.5) * 2.0);

  int   n   = int(clamp(u_node_count, 3.0, 12.0));
  float hier = clamp(u_hierarchy, 0.0, 1.0);
  float comp = clamp(u_complexity, 0.1, 1.0);

  vec3 accentCol = u_phase < 0.5
    ? vec3(1.0, 0.239, 0.341)
    : vec3(0.784, 1.0, 0.0);
  vec3 centerCol = vec3(0.4, 0.7, 1.0);

  // ── BACKGROUND ──────────────────────────────────────────────────────
  vec3 col = vec3(0.02, 0.02, 0.06);

  // Subtle particle field
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    vec2 sp = vec2(hash(fi) * 2.0 - 1.0, hash2(fi) * 2.0 - 1.0);
    sp.x *= ar;
    float sd = length(p - sp);
    col += vec3(0.05, 0.05, 0.15) * 0.001 / (sd * sd + 0.0005);
  }

  // ── CENTRAL NODE ────────────────────────────────────────────────────
  vec2  center  = vec2(0.0, 0.0);
  float pulse   = 0.7 + 0.3 * sin(u_time * 2.0);
  float cNode   = node(p, center, 0.07 * pulse);
  col = mix(col, centerCol + 0.3, cNode);
  // Halo
  col += centerCol * smoothstep(0.30, 0.0, length(p)) * 0.08 * pulse;

  // ── PERIPHERAL NODES ────────────────────────────────────────────────
  for (int i = 0; i < 12; i++) {
    if (i >= n) break;
    float fi    = float(i);
    float angle = TAU * fi / float(n) + u_time * 0.15 * (1.0 - hier * 0.7);

    // Hierarchy: expert nodes spread into layers, student nodes flat
    float radius;
    if (hier > 0.5) {
      // Two-layer hierarchy
      float layer = float(i % 2);
      radius = 0.45 + layer * 0.30 + hash(fi) * 0.08;
      angle += layer * 0.5;
    } else {
      // Flat: all on one ring
      radius = 0.55 + sin(u_time * 0.3 + fi) * 0.05 * comp;
    }

    radius *= ar * 0.55;
    vec2 nodePos = vec2(cos(angle) * radius / ar, sin(angle) * radius);

    // Node glow
    float nGlow  = node(p, nodePos, 0.04);
    float nPulse = 0.6 + 0.4 * sin(u_time * 1.5 + fi * 1.3);
    col = mix(col, accentCol, nGlow * nPulse);

    // ── EDGES to center ────────────────────────────────────────────────
    float eLine  = edge(p, center, nodePos, 0.008);
    float pulseT = mod(u_time * 0.5 + fi * 0.15, 1.0);
    float ePulse = edgePulse(p, center, nodePos, pulseT);
    col = mix(col, accentCol * 0.5, eLine * 0.35);
    col += accentCol * ePulse * 0.7;

    // ── Cross-edges between nodes (expert has more connections) ────────
    if (hier > 0.5 && comp > 0.5 && i < n - 1) {
      int j = (i + 2) % n;
      float fj     = float(j);
      float angleJ = TAU * fj / float(n) + u_time * 0.15 * 0.3;
      float layerJ = float(j % 2);
      float radiusJ = (0.45 + layerJ * 0.30 + hash(fj) * 0.08) * ar * 0.55;
      vec2  nodePosJ = vec2(cos(angleJ) * radiusJ / ar, sin(angleJ) * radiusJ);

      float crossE  = edge(p, nodePos, nodePosJ, 0.005);
      float crossPT = mod(u_time * 0.4 + fi * 0.2 + 0.5, 1.0);
      float crossPulse = edgePulse(p, nodePos, nodePosJ, crossPT);
      col = mix(col, accentCol * 0.3, crossE * 0.25);
      col += accentCol * 0.5 * crossPulse * 0.5;
    }
  }

  // ── COMPLEXITY FIELD: fog-like complexity indicator ────────────────
  float fog = comp * 0.06 * (0.5 + 0.5 * sin(length(p) * 3.0 - u_time * 1.5));
  col += accentCol * fog * 0.3;

  // ── VIGNETTE ─────────────────────────────────────────────────────────
  vec2 vd = (uv - 0.5) * 2.0;
  col *= 1.0 - dot(vd, vd) * 0.3;

  fragColor = vec4(col, 1.0);
}`;

function buildGeometry(_p: SimParams, _ph: Phase): TemplateGeometry {
  const v = new Float32Array([-1,-1, 1,-1, -1,1, 1,-1, 1,1, -1,1]);
  return { vertices: v, attribs: [{ name: "a_pos", size: 2, offset: 0, stride: 8 }] };
}

function getUniforms(params: SimParams, phase: Phase, _t: number): UniformDescriptor[] {
  const s = phase === PHASE_STUDENT;
  return [
    { name: "u_node_count", type: "1f", value: Number(params.node_count ?? (s ? 4 : 8)) },
    { name: "u_hierarchy",  type: "1f", value: Number(params.hierarchy  ?? (s ? 0 : 1)) },
    { name: "u_complexity", type: "1f", value: Number(params.complexity ?? (s ? 0.3 : 0.8)) },
  ];
}

function drawCall(_: Phase): DrawCall { return { mode: 0x0004, count: 6 }; }

const genericTemplate: SimTemplate = {
  hint: "generic", label: "Concept Network",
  subjects: ["mathematics", "physics", "chemistry", "biology", "computer_science"],
  buildGeometry, getUniforms, drawCall, vertexShader, fragmentShader,
};
export default genericTemplate;
