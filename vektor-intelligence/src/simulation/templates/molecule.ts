/**
 * src/simulation/templates/molecule.ts
 * VEKTOR — Molecular Structure Simulation (Pure Fragment Shader)
 *
 * YOUR MODEL  (phase=0): student's bond angle (often wrong — e.g. 90° for water)
 * EXPERT MODEL (phase=1): correct VSEPR bond angle (104.5° for water, etc.)
 *
 * Visual: 3D-like rotating molecule, glowing atoms, animated bonds,
 *         angle arc showing the actual bond angle
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
uniform float u_bond_angle;      // degrees
uniform float u_molecule_type;   // 0=water, 1=methane, 2=co2, 3=generic

const float PI  = 3.14159265359;
const float DEG = PI / 180.0;

// Soft atom glow
float atom(vec2 p, vec2 c, float r, float gR) {
  float d = length(p - c);
  return smoothstep(r, r * 0.3, d) + smoothstep(gR, 0.0, d) * 0.4;
}

// Bond (thick line between two points)
float bond(vec2 p, vec2 a, vec2 b, float r) {
  vec2 ab = b - a;
  float t  = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  return smoothstep(r, r * 0.3, length(p - (a + t * ab)));
}

// Arc for angle display
float arc(vec2 p, vec2 c, float radius, float a1, float a2) {
  float d   = length(p - c);
  float ang = atan(p.y - c.y, p.x - c.x);
  // Normalise angle to [a1, a2]
  float mid = (a1 + a2) * 0.5;
  float span = abs(a2 - a1) * 0.5;
  float da  = abs(ang - mid);
  if (da > PI) da = TAU - da;
  float inArc = smoothstep(span, span * 0.9, da);
  return smoothstep(0.025, 0.004, abs(d - radius)) * inArc;
}

const float TAU = 6.28318530718;

void main() {
  vec2  uv = v_uv;
  float ar = u_resolution.x / u_resolution.y;
  vec2  p  = vec2((uv.x - 0.5) * 2.0 * ar, (uv.y - 0.5) * 2.0);

  // Slow rotation of the whole molecule
  float rot  = u_time * 0.4;
  float cosR = cos(rot); float sinR = sin(rot);
  vec2  rp   = vec2(p.x * cosR - p.y * sinR, p.x * sinR + p.y * cosR);

  float ang  = u_bond_angle * DEG;  // half angle on each side
  float half = ang * 0.5;

  // ── BACKGROUND ───────────────────────────────────────────────────────
  vec3 col = vec3(0.02, 0.02, 0.06);

  // Phase accent
  vec3 accentCol = u_phase < 0.5
    ? vec3(1.0, 0.239, 0.341)
    : vec3(0.784, 1.0, 0.0);
  vec3 atomACol  = vec3(0.2, 0.5, 1.0);   // central atom (O/C)
  vec3 atomBCol  = vec3(0.9, 0.9, 0.9);   // peripheral (H)

  vec2 center = vec2(0.0, 0.05);

  float totalContrib = 0.0;

  if (u_molecule_type < 0.5) {
    // ── WATER: O in center, two H ──────────────────────────────────────
    float bondLen = 0.42;
    vec2  h1 = center + vec2(-sin(half), -cos(half)) * bondLen;
    vec2  h2 = center + vec2( sin(half), -cos(half)) * bondLen;

    // Bonds (animated pulsing)
    float pulse = 0.9 + 0.1 * sin(u_time * 3.0);
    float b1 = bond(rp, center, h1, 0.025 * pulse);
    float b2 = bond(rp, center, h2, 0.025 * pulse);
    col = mix(col, accentCol, (b1 + b2) * 0.8);

    // Atoms
    float oAtom = atom(rp, center, 0.10, 0.25);
    float h1A   = atom(rp, h1,     0.06, 0.18);
    float h2A   = atom(rp, h2,     0.06, 0.18);
    col = mix(col, atomACol + 0.2,  oAtom);
    col = mix(col, atomBCol,        h1A + h2A);

    // Glow around O (lone pairs region)
    float lonePair = smoothstep(0.28, 0.10, length(rp - center)) * 0.15;
    col += atomACol * lonePair;

    // Bond angle arc
    float arcA = arc(rp, center, bondLen * 0.45, PI + PI * 0.5 - half, PI + PI * 0.5 + half);
    col = mix(col, vec3(1.0, 0.9, 0.2), arcA * 0.9);

  } else if (u_molecule_type < 1.5) {
    // ── METHANE: C in center, 4 H (tetrahedral projected) ─────────────
    float bondLen = 0.45;
    float tetAng  = ang;  // 109.5 expert
    // 4 H positions in 2D projection of tetrahedron
    vec2 positions[4];
    positions[0] = center + vec2(0.0, bondLen);
    positions[1] = center + vec2( bondLen * sin(tetAng * 0.5),  -bondLen * cos(tetAng * 0.5));
    positions[2] = center + vec2(-bondLen * sin(tetAng * 0.5),  -bondLen * cos(tetAng * 0.5));
    positions[3] = center + vec2( bondLen * 0.3, bondLen * 0.5) * 0.8;  // back-projected

    float pulse = 0.9 + 0.1 * sin(u_time * 2.5);
    for (int i = 0; i < 4; i++) {
      float b = bond(rp, center, positions[i], 0.022 * pulse);
      col = mix(col, accentCol, b * 0.75);
      float h = atom(rp, positions[i], 0.055, 0.16);
      col = mix(col, atomBCol, h);
    }
    float cAtom = atom(rp, center, 0.09, 0.22);
    col = mix(col, vec3(0.4, 0.4, 0.4) + 0.1, cAtom);

  } else if (u_molecule_type < 2.5) {
    // ── CO2: linear (180°) ─────────────────────────────────────────────
    float bondLen = 0.50;
    vec2  o1 = center + vec2(-bondLen, 0.0);
    vec2  o2 = center + vec2( bondLen, 0.0);
    // Double bonds
    float pulse = 0.9 + 0.1 * sin(u_time * 3.5);
    float b1a = bond(rp, center, o1 + vec2(0.0,  0.022), 0.018 * pulse);
    float b1b = bond(rp, center, o1 - vec2(0.0,  0.022), 0.018 * pulse);
    float b2a = bond(rp, center, o2 + vec2(0.0,  0.022), 0.018 * pulse);
    float b2b = bond(rp, center, o2 - vec2(0.0,  0.022), 0.018 * pulse);
    col = mix(col, accentCol, (b1a + b1b + b2a + b2b) * 0.8);
    float cA  = atom(rp, center, 0.08, 0.20);
    float o1A = atom(rp, o1, 0.09, 0.22);
    float o2A = atom(rp, o2, 0.09, 0.22);
    col = mix(col, vec3(0.5, 0.5, 0.5), cA);
    col = mix(col, vec3(1.0, 0.3, 0.2), o1A + o2A);

  } else {
    // ── GENERIC ───────────────────────────────────────────────────────
    float bondLen = 0.45;
    vec2  a1 = center + vec2(-sin(half), -cos(half)) * bondLen;
    vec2  a2 = center + vec2( sin(half), -cos(half)) * bondLen;
    float b1 = bond(rp, center, a1, 0.025);
    float b2 = bond(rp, center, a2, 0.025);
    col = mix(col, accentCol, (b1 + b2) * 0.8);
    col = mix(col, atomACol, atom(rp, center, 0.09, 0.22));
    col = mix(col, atomBCol, atom(rp, a1, 0.06, 0.17) + atom(rp, a2, 0.06, 0.17));
    float arcA = arc(rp, center, bondLen * 0.4, PI + PI * 0.5 - half, PI + PI * 0.5 + half);
    col = mix(col, vec3(1.0, 0.9, 0.2), arcA * 0.9);
  }

  // ── ELECTRON CLOUD ANIMATION ─────────────────────────────────────────
  float cloud = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi   = float(i);
    float eAngle = u_time * (2.0 + fi * 0.7) + fi * TAU / 3.0;
    float eR   = 0.18 + fi * 0.08;
    vec2  ePos = center + vec2(cos(eAngle) * eR, sin(eAngle) * eR * 0.5);
    float ed   = length(rp - ePos);
    cloud += smoothstep(0.018, 0.002, ed) * 0.6;
  }
  col += accentCol * cloud * 0.4;

  // ── VIGNETTE ─────────────────────────────────────────────────────────
  vec2 vd = (uv - 0.5) * 2.0;
  col *= 1.0 - dot(vd, vd) * 0.25;

  fragColor = vec4(col, 1.0);
}`;

function buildGeometry(_p: SimParams, _ph: Phase): TemplateGeometry {
  const v = new Float32Array([-1,-1, 1,-1, -1,1, 1,-1, 1,1, -1,1]);
  return { vertices: v, attribs: [{ name: "a_pos", size: 2, offset: 0, stride: 8 }] };
}

function getUniforms(params: SimParams, phase: Phase, _t: number): UniformDescriptor[] {
  const s = phase === PHASE_STUDENT;
  const molType = { water: 0, methane: 1, co2: 2 } as Record<string, number>;
  const mt = typeof params.molecule_type === "string"
    ? (molType[params.molecule_type] ?? 0) : Number(params.molecule_type ?? 0);
  return [
    { name: "u_bond_angle",    type: "1f", value: Number(params.bond_angle    ?? (s ? 90.0 : 104.5)) },
    { name: "u_molecule_type", type: "1f", value: mt },
  ];
}

function drawCall(_: Phase): DrawCall { return { mode: 0x0004, count: 6 }; }

const moleculeTemplate: SimTemplate = {
  hint: ["molecule", "bond", "dna", "cell", "membrane", "protein"] as any,
  label: "Molecular Structure",
  subjects: ["chemistry", "biology"],
  buildGeometry, getUniforms, drawCall, vertexShader, fragmentShader,
};
export default moleculeTemplate;
