/**
 * src/simulation/templates/wave.ts
 * VEKTOR — Wave Physics Simulation (Pure Fragment Shader)
 *
 * YOUR MODEL  (phase=0): student's described wave behaviour
 *   - Wrong frequency / amplitude / speed
 *   - May show wave travelling faster with more amplitude (misconception)
 *
 * EXPERT MODEL (phase=1): correct wave physics
 *   - Speed independent of amplitude
 *   - Correct superposition / standing waves
 *
 * Visual: animated travelling wave with particle motion dots,
 *         wavefronts, damping envelope, interference pattern
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
uniform float u_frequency;
uniform float u_amplitude;
uniform float u_phase_shift;
uniform float u_wave_speed;
uniform float u_damping;
uniform float u_components;

const float PI  = 3.14159265359;
const float TAU = 6.28318530718;

float wave(float x, float t, float freq, float amp, float speed, float damp, float ps) {
  float k     = TAU * freq;
  float omega = k * speed;
  float env   = exp(-damp * x * 0.3);
  return amp * sin(k * x - omega * t + ps) * env;
}

void main() {
  vec2  uv = v_uv;
  float ar = u_resolution.x / u_resolution.y;
  float wx = (uv.x - 0.5) * 2.0 * ar;
  float wy = (uv.y - 0.5) * 2.0;

  // t in x-space: x ∈ [0, 4π]
  float x = uv.x * TAU * 2.0;

  // Compute wave Y at this column
  float y1 = wave(x, u_time, u_frequency, u_amplitude, u_wave_speed, u_damping, u_phase_shift);
  float waveY = y1;

  if (u_components > 1.5) {
    // Standing wave: two opposite waves
    float y2 = wave(x, u_time, u_frequency, u_amplitude, -u_wave_speed, u_damping, 0.0);
    waveY = y1 + y2;
  } else if (u_components > 0.5) {
    // Superposition: two slightly different frequencies
    float y2 = wave(x, u_time, u_frequency * 1.25, u_amplitude * 0.6, u_wave_speed, u_damping, u_phase_shift + 1.2);
    waveY = y1 + y2;
  }

  waveY *= 0.65; // scale to screen

  // Phase color
  vec3 waveCol = u_phase < 0.5
    ? vec3(1.0, 0.239, 0.341)
    : vec3(0.784, 1.0, 0.0);

  // ── BACKGROUND ────────────────────────────────────────────────────────
  vec3 col = vec3(0.02, 0.02, 0.06);

  // ── GRID ──────────────────────────────────────────────────────────────
  vec2 gp = abs(fract(uv * 10.0) - 0.5);
  float gl = max(smoothstep(0.47, 0.5, gp.x), smoothstep(0.47, 0.5, gp.y));
  col += vec3(0.04, 0.04, 0.09) * gl;

  // ── EQUILIBRIUM LINE ──────────────────────────────────────────────────
  float eqLine = smoothstep(0.005, 0.001, abs(wy));
  col = mix(col, vec3(0.3, 0.3, 0.5), eqLine * 0.5);

  // ── WAVE FILL (area between wave and equilibrium) ──────────────────────
  float aboveEq = (waveY >= 0.0)
    ? step(0.0, wy) * step(wy, waveY)
    : step(waveY, wy) * step(wy, 0.0);
  col = mix(col, waveCol, aboveEq * 0.15);

  // ── WAVE LINE ─────────────────────────────────────────────────────────
  float distW = abs(wy - waveY);
  float waveLine = smoothstep(0.035, 0.003, distW);
  float waveGlow = smoothstep(0.15, 0.0, distW) * 0.3;
  col = mix(col, waveCol, waveGlow);
  col = mix(col, waveCol + 0.2, waveLine);

  // ── PARTICLE MOTION DOTS (vertical oscillating dots) ──────────────────
  // Show 8 particles evenly spaced along the wave
  for (int i = 0; i < 8; i++) {
    float px = float(i) / 7.0;
    float pxW = px * TAU * 2.0;
    float pyW = wave(pxW, u_time, u_frequency, u_amplitude, u_wave_speed, u_damping, u_phase_shift) * 0.65;
    // Also add second component if needed
    if (u_components > 0.5) {
      float y2 = (u_components > 1.5)
        ? wave(pxW, u_time, u_frequency, u_amplitude, -u_wave_speed, u_damping, 0.0) * 0.65
        : wave(pxW, u_time, u_frequency * 1.25, u_amplitude * 0.6, u_wave_speed, u_damping, u_phase_shift + 1.2) * 0.65;
      pyW += y2;
    }
    vec2 particlePos = vec2((px - 0.5) * 2.0 * ar, pyW);
    float dp = length(vec2(wx, wy) - particlePos);
    float dotA = smoothstep(0.030, 0.005, dp);
    float dotGl = smoothstep(0.08, 0.0, dp) * 0.4;
    col = mix(col, waveCol,        dotGl);
    col = mix(col, waveCol + 0.4,  dotA);
    // Vertical motion trail
    vec2 restPos = vec2((px - 0.5) * 2.0 * ar, 0.0);
    float trailD = length(vec2(wx - restPos.x, 0.0));
    float trail  = smoothstep(0.01, 0.001, trailD) * smoothstep(abs(pyW), 0.0, abs(wy));
    col += waveCol * trail * 0.12;
  }

  // ── WAVEFRONT INDICATOR (moving vertical line at leading edge) ─────────
  float frontX = mod(u_time * u_wave_speed * 0.3, 1.0);
  float frontD = abs(uv.x - frontX);
  float front  = smoothstep(0.015, 0.001, frontD);
  col += vec3(1.0, 1.0, 0.3) * front * 0.35;

  // ── DAMPING ENVELOPE ──────────────────────────────────────────────────
  if (u_damping > 0.05) {
    float envY  = u_amplitude * exp(-u_damping * x * 0.3) * 0.65;
    float envD1 = abs(wy - envY);
    float envD2 = abs(wy + envY);
    float envL  = smoothstep(0.025, 0.003, min(envD1, envD2));
    col = mix(col, vec3(0.5, 0.5, 1.0), envL * 0.4);
  }

  // ── VIGNETTE ──────────────────────────────────────────────────────────
  vec2 vd = (uv - 0.5) * 2.0;
  col *= 1.0 - dot(vd, vd) * 0.2;

  fragColor = vec4(col, 1.0);
}`;

function buildGeometry(_p: SimParams, _ph: Phase): TemplateGeometry {
  const v = new Float32Array([-1,-1, 1,-1, -1,1, 1,-1, 1,1, -1,1]);
  return { vertices: v, attribs: [{ name: "a_pos", size: 2, offset: 0, stride: 8 }] };
}

function getUniforms(params: SimParams, phase: Phase, _t: number): UniformDescriptor[] {
  const s = phase === PHASE_STUDENT;
  return [
    { name: "u_frequency",   type: "1f", value: Number(params.frequency   ?? 1.0) },
    { name: "u_amplitude",   type: "1f", value: Number(params.amplitude   ?? 0.8) },
    { name: "u_phase_shift", type: "1f", value: Number(params.phase_shift ?? 0.0) },
    { name: "u_wave_speed",  type: "1f", value: Number(params.wave_speed  ?? (s ? 2.0 : 1.0)) },
    { name: "u_damping",     type: "1f", value: Number(params.damping     ?? 0.0) },
    { name: "u_components",  type: "1f", value: Number(params.components  ?? 1.0) },
  ];
}

function drawCall(_: Phase): DrawCall { return { mode: 0x0004, count: 6 }; }

const waveTemplate: SimTemplate = {
  hint: "wave", label: "Wave Propagation",
  subjects: ["physics", "mathematics"],
  buildGeometry, getUniforms, drawCall, vertexShader, fragmentShader,
};
export default waveTemplate;
