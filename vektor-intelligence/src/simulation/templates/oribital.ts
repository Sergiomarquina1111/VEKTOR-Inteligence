/**
 * src/simulation/templates/oribital.ts   (filename keeps existing typo)
 * VEKTOR — Kepler Orbital Mechanics Simulation
 *
 * YOUR MODEL  (phase=0): planet on student's described orbit
 *   - eccentricity=0 → perfect circle, constant speed  (common misconception)
 *   - speed_model=0  → constant angular velocity
 *   - high eccentricity with wrong speed → planet flies off or spirals
 *
 * EXPERT MODEL (phase=1): correct Kepler orbit
 *   - elliptical path (eccentricity > 0)
 *   - speed_model=1 → faster at perihelion, slower at aphelion (2nd law)
 *   - orbital trail fades behind planet
 *
 * Visual elements:
 *   - Star at focus (glowing yellow)
 *   - Planet with colored trail
 *   - Orbit path (faint ellipse)
 *   - Speed indicator glow around planet (brighter = faster)
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
uniform float u_phase;
uniform vec2  u_resolution;
uniform float u_eccentricity;
uniform float u_semi_major;
uniform float u_speed_model;
uniform float u_period;

const float PI  = 3.14159265359;
const float TAU = 6.28318530718;

// Solve Kepler's equation E - e*sin(E) = M  via Newton iteration
float solveKepler(float M, float e) {
  float E = M;
  for (int i = 0; i < 8; i++) {
    E = E - (E - e * sin(E) - M) / (1.0 - e * cos(E));
  }
  return E;
}

vec2 orbitPosition(float t, float a, float e, float speedModel) {
  float M;
  if (speedModel < 0.5) {
    // Constant angular speed (student misconception)
    M = TAU * t;
  } else {
    // Kepler: mean anomaly → eccentric anomaly → true position
    M = TAU * t;
    float E = solveKepler(M, e);
    float nu = 2.0 * atan(sqrt((1.0 + e) / (1.0 - e + 0.0001)) * tan(E * 0.5));
    float r  = a * (1.0 - e * cos(E));
    return vec2(r * cos(nu), r * sin(nu));
  }
  // Constant speed fallback: circle
  float r = a * (1.0 - e * e) / (1.0 + e * cos(M));
  return vec2(r * cos(M), r * sin(M));
}

// SDF circle
float sdCircle(vec2 p, vec2 c, float r) {
  return length(p - c) - r;
}

// Glow function
float glow(float d, float radius, float falloff) {
  return radius / (abs(d) * falloff + 0.001);
}

void main() {
  vec2  uv  = v_uv;
  float ar  = u_resolution.x / u_resolution.y;
  vec2  p   = vec2((uv.x - 0.5) * 2.0 * ar, (uv.y - 0.5) * 2.0);

  float e = clamp(u_eccentricity, 0.0, 0.92);
  float a = u_semi_major * 1.4;
  float T = max(u_period, 1.0);

  // Star is at the focus of the ellipse
  float focusX = a * e;
  vec2  star   = vec2(-focusX, 0.0);

  // Current time normalised to orbit period
  float tNorm  = mod(u_time / T, 1.0);

  // Current planet position
  vec2  planet = orbitPosition(tNorm, a, e, u_speed_model);

  // ── BACKGROUND: deep space ─────────────────────────────────────────────
  vec3 col = vec3(0.02, 0.02, 0.06);

  // Stars: pseudo-random dots
  vec2 sp = p * 8.0;
  float starField = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2  sc = vec2(fract(sin(fi * 127.1 + 311.7) * 43758.5),
                   fract(sin(fi * 269.5 + 183.3) * 43758.5)) * 2.0 - 1.0;
    sc *= ar * 1.5;
    float sd = length(p - sc);
    starField += 0.0004 / (sd * sd + 0.0001);
  }
  col += vec3(0.8, 0.85, 1.0) * min(starField, 0.3);

  // ── ORBIT PATH (ellipse) ────────────────────────────────────────────────
  // Parametric ellipse: x = -focusX + a*cos(t), y = b*sin(t)
  float b = a * sqrt(max(1.0 - e * e, 0.001));
  // Approximate distance to ellipse
  vec2  shifted = p - vec2(-focusX, 0.0);
  float dEllipse = abs(length(vec2(shifted.x / a, shifted.y / b)) - 1.0)
                   * min(a, b);
  float orbitAlpha = smoothstep(0.03, 0.005, dEllipse);
  vec3  orbitCol   = u_phase < 0.5
    ? vec3(1.0, 0.3, 0.4) : vec3(0.5, 0.8, 1.0);
  col = mix(col, orbitCol, orbitAlpha * 0.25);

  // ── TRAIL (last ~30% of orbit behind planet) ────────────────────────────
  for (int s = 1; s <= 24; s++) {
    float dt   = float(s) * 0.012;
    float tPast = mod(tNorm - dt, 1.0);
    vec2  pp   = orbitPosition(tPast, a, e, u_speed_model);
    float dtr  = length(p - pp);
    float fade = 1.0 - float(s) / 24.0;
    float tr   = smoothstep(0.018, 0.003, dtr) * fade * fade;
    col = mix(col, orbitCol, tr * 0.6);
  }

  // ── STAR (at focus) ─────────────────────────────────────────────────────
  float dStar = length(p - star);
  float starCore = smoothstep(0.045, 0.0, dStar);
  float starGlow = 0.012 / (dStar * dStar + 0.003);
  col += vec3(1.0, 0.9, 0.3) * starGlow * 0.6;
  col  = mix(col, vec3(1.0, 0.97, 0.7), starCore);
  // Corona rays
  float angle = atan(p.y - star.y, p.x - star.x);
  float rays  = pow(max(0.0, sin(angle * 6.0)), 8.0);
  col += vec3(1.0, 0.8, 0.2) * rays * smoothstep(0.25, 0.04, dStar) * 0.15;

  // ── PLANET ──────────────────────────────────────────────────────────────
  float dPlanet = length(p - planet);
  // Speed indicator: brighter planet = faster (only on expert)
  float speed = 1.0;
  if (u_speed_model > 0.5) {
    float r_dist = length(planet - star);
    speed = clamp(a / (r_dist + 0.01), 0.5, 3.0);
  }
  float planetCore = smoothstep(0.038, 0.002, dPlanet);
  float planetGlow = clamp(0.008 / (dPlanet * dPlanet + 0.002), 0.0, 1.0) * speed;
  vec3  planetCol  = u_phase < 0.5
    ? vec3(0.4, 0.6, 1.0)   // blue — student
    : vec3(0.3, 1.0, 0.6);  // green — expert
  col += planetCol * planetGlow;
  col  = mix(col, planetCol + 0.3, planetCore);

  // ── ESCAPE WARNING (student model with bad params) ──────────────────────
  if (u_phase < 0.5 && u_speed_model < 0.5 && e > 0.7) {
    // Red flash warning when orbit looks unstable
    float warn = sin(u_time * 4.0) * 0.5 + 0.5;
    float edge = 1.0 - smoothstep(0.85, 1.0, length(uv - 0.5) * 1.5);
    col = mix(col, vec3(1.0, 0.1, 0.1), warn * 0.12 * (1.0 - edge));
  }

  // ── VIGNETTE ────────────────────────────────────────────────────────────
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
    { name: "u_eccentricity", type: "1f", value: Number(params.eccentricity ?? (s ? 0.0 : 0.45)) },
    { name: "u_semi_major",   type: "1f", value: Number(params.semi_major   ?? 0.5) },
    { name: "u_speed_model",  type: "1f", value: Number(params.speed_model  ?? (s ? 0.0 : 1.0)) },
    { name: "u_period",       type: "1f", value: Number(params.period       ?? 8.0) },
  ];
}

function drawCall(_: Phase): DrawCall { return { mode: 0x0004, count: 6 }; }

const orbitalTemplate: SimTemplate = {
  hint: "orbital", label: "Orbital Mechanics (Kepler)",
  subjects: ["physics"],
  buildGeometry, getUniforms, drawCall, vertexShader, fragmentShader,
};
export default orbitalTemplate;
