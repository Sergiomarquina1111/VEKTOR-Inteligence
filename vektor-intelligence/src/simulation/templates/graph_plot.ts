/**
 * src/simulation/templates/graph_plot.ts
 * VEKTOR Intelligence — graph_plot WebGL2 template
 * Version: 2.2.0
 *
 * FIXES in v2.2.0:
 *  1. `df_perceived()` correctly scales by u_derivative_scale so T3 misconception
 *     (derivative_scale=0.5) renders a visually distinct shallower tangent/curve
 *     vs the expert (derivative_scale=1.0).
 *  2. Tangent line extends ±0.8 units (was ±0.6) so it's visible at canvas edges.
 *  3. Derivative curve dash pattern fixed — was inverting the on/off mask causing
 *     gaps where lines should be and lines where gaps should be.
 *  4. `u_show_derivative` uniform correctly gates the derivative curve rendering.
 *  5. Grid lines use correct period (0.25 units, matching a -1..1 NDC space).
 *  6. Touch-point x-oscillation clamped to [-1.0, 1.0] so it never leaves
 *     the visible canvas area.
 *  7. buildGeometry() covers the full NDC range with a fullscreen quad.
 */

import type {
  SimTemplate,
  SimParams,
  Phase,
  UniformDescriptor,
  DrawCall,
  GeometryData,
  AttribDescriptor,
} from "../types";
import { PHASE_EXPERT } from "../types";

// ─── Colors ───────────────────────────────────────────────────────────────────

const STUDENT_COLOR: [number, number, number] = [1.0, 0.42, 0.615];   // #FF6B9D
const EXPERT_COLOR:  [number, number, number] = [0.0, 0.831, 0.667];  // #00D4AA
const DERIV_COLOR:   [number, number, number] = [0.482, 0.361, 1.0];  // #7B5CFF
const TANGENT_COLOR: [number, number, number] = [1.0, 0.843, 0.0];    // #FFD700

// ─── Shaders ──────────────────────────────────────────────────────────────────

const VERT = /* glsl */ `#version 300 es
precision highp float;

in  vec2 a_pos;
out vec2 v_uv;

uniform mat3 u_transform;

void main() {
  vec3 p  = u_transform * vec3(a_pos, 1.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
  v_uv = a_pos;
}`;

const FRAG = /* glsl */ `#version 300 es
precision highp float;

in  vec2 v_uv;
out vec4 fragColor;

uniform float u_time;
uniform vec2  u_resolution;

// Phase-aware colors
uniform vec3  u_main_color;      // student (#FF6B9D) or expert (#00D4AA)
uniform vec3  u_deriv_color;     // derivative curve — always #7B5CFF
uniform vec3  u_tangent_color;   // tangent line     — always #FFD700

// graph_plot params
uniform float u_func_type;         // 0=sine 1=cubic 2=parabola 3=abs
uniform float u_amplitude;
uniform float u_frequency;
uniform float u_derivative_scale;  // 0.5 = T3 wrong, 1.0 = expert correct
uniform float u_show_derivative;   // 0|1 — draw the derivative curve
uniform float u_show_tangent;      // 0|1 — draw the animated tangent line
uniform float u_show_integral;     // 0|1 — shade area under curve

#define PI 3.14159265

// ── Function definitions ──────────────────────────────────────────────────────

float f(float x) {
  if (u_func_type < 0.5) return u_amplitude * sin(u_frequency * x * PI);
  if (u_func_type < 1.5) return x * x * x * 0.4;
  if (u_func_type < 2.5) return x * x;
  return abs(x);
}

// True analytical derivative (always correct, full magnitude)
float df_true(float x) {
  if (u_func_type < 0.5) return u_amplitude * u_frequency * PI * cos(u_frequency * x * PI);
  if (u_func_type < 1.5) return 1.2 * x * x;
  if (u_func_type < 2.5) return 2.0 * x;
  return sign(x);
}

// Perceived derivative — scaled by u_derivative_scale.
// When u_derivative_scale = 0.5 (T3 misconception: "d/dx x² = x"):
//   df_perceived(x) = 2x * 0.5 = x   ← student's wrong belief visualised
// When u_derivative_scale = 1.0 (correct):
//   df_perceived(x) = 2x * 1.0 = 2x  ← expert's correct value
float df_perceived(float x) {
  return df_true(x) * u_derivative_scale;
}

// ── Distance helpers ──────────────────────────────────────────────────────────

// Pixel-space distance from point p to the graph of y=func(x)
float curveDist(vec2 p, float px_per_unit) {
  return abs(p.y - f(p.x)) * px_per_unit;
}

float derivCurveDist(vec2 p, float px_per_unit) {
  return abs(p.y - df_perceived(p.x)) * px_per_unit;
}

// Pixel-space distance from point p to the tangent line at (xp, f(xp))
float tangentDist(vec2 p, float xp, float slope, float px_per_unit, out float along) {
  float yp  = f(xp);
  vec2  dir = normalize(vec2(1.0, slope));
  vec2  dp  = p - vec2(xp, yp);
  along     = dot(dp, dir);
  float perp = length(dp - along * dir);
  return perp * px_per_unit;
}

// ── Main ──────────────────────────────────────────────────────────────────────

void main() {
  vec2  uv          = v_uv;
  float px_per_unit = u_resolution.x * 0.5;

  // Background
  vec3 col = vec3(0.031, 0.031, 0.063);

  // ── Grid ──
  // 0.25-unit grid lines in [-1, 1] space
  float gx = mod(uv.x * 4.0 + 1000.0, 1.0);
  float gy = mod(uv.y * 4.0 + 1000.0, 1.0);
  float gs = 0.03 / (px_per_unit * 0.25);  // 1 pixel grid line
  if (gx < gs || gy < gs) {
    col = mix(col, vec3(0.11, 0.11, 0.22), 0.55);
  }

  // ── Axes ──
  if (abs(uv.x) * px_per_unit < 1.2) col = mix(col, vec3(0.25, 0.25, 0.45), 0.9);
  if (abs(uv.y) * px_per_unit < 1.2) col = mix(col, vec3(0.25, 0.25, 0.45), 0.9);

  // ── Animated touch-point: x in [-1, 1] ──
  float xp = clamp(sin(u_time * 0.55) * 0.9, -1.0, 1.0);
  float yp = f(xp);

  // ── Integral shading (below curve to x-axis) ──
  if (u_show_integral > 0.5) {
    float fy = f(uv.x);
    bool above = fy > 0.0 && uv.y > 0.0 && uv.y < fy;
    bool below = fy < 0.0 && uv.y < 0.0 && uv.y > fy;
    if (above || below) {
      float fade = 1.0 - abs(uv.y / max(abs(fy), 0.001));
      col = mix(col, u_main_color * 0.45, 0.35 * fade);
    }
  }

  // ── Main function curve f(x) ──
  float cd      = curveDist(uv, px_per_unit);
  float curve_a = 1.0 - smoothstep(1.2, 3.0, cd);
  col = mix(col, u_main_color, curve_a * 0.95);

  // ── Derivative curve f'(x) (dashed, gated by u_show_derivative) ──
  if (u_show_derivative > 0.5) {
    float dd      = derivCurveDist(uv, px_per_unit);
    float deriv_a = 1.0 - smoothstep(1.0, 2.5, dd);

    // FIXED: dash = 1 when in the "on" segment, 0 in "off" segment.
    // Previously the step was inverted, making gaps where lines should be.
    float dash = step(0.5, fract(uv.x * 5.0 + 0.25));
    col = mix(col, u_deriv_color, deriv_a * 0.88 * dash);
  }

  // ── Tangent line at xp ──
  if (u_show_tangent > 0.5) {
    float slope = df_perceived(xp);
    float along;
    float td = tangentDist(uv, xp, slope, px_per_unit, along);

    // Show ±0.8 units either side of the touch-point
    float clip   = step(abs(along), 0.8);
    float tang_a = (1.0 - smoothstep(1.5, 3.0, td)) * clip;
    col = mix(col, u_tangent_color, tang_a * 0.92);

    // Touch-point dot (radius ~5 px)
    float dot_d = length(uv - vec2(xp, yp)) * px_per_unit;
    float dot_a = 1.0 - smoothstep(4.0, 6.5, dot_d);
    col = mix(col, u_tangent_color, dot_a);
  }

  fragColor = vec4(col, 1.0);
}`;

// ─── Template implementation ──────────────────────────────────────────────────

const graphPlotTemplate: SimTemplate = {
  vertexShader:   VERT,
  fragmentShader: FRAG,

  getUniforms(
    params: SimParams,
    phase:  Phase,
    _time:  number,
  ): UniformDescriptor[] {
    const isExpert  = phase === PHASE_EXPERT;
    const mainColor = isExpert ? EXPERT_COLOR : STUDENT_COLOR;

    return [
      // Colors
      { name: "u_main_color",       type: "3f", value: mainColor    },
      { name: "u_deriv_color",      type: "3f", value: DERIV_COLOR  },
      { name: "u_tangent_color",    type: "3f", value: TANGENT_COLOR },
      // Graph params
      { name: "u_func_type",        type: "1f", value: params.func_type        ?? 2   },
      { name: "u_amplitude",        type: "1f", value: params.amplitude        ?? 0.8 },
      { name: "u_frequency",        type: "1f", value: params.frequency        ?? 0.9 },
      { name: "u_derivative_scale", type: "1f", value: params.derivative_scale ?? 1.0 },
      { name: "u_show_derivative",  type: "1f", value: params.show_derivative  ?? 0   },
      { name: "u_show_tangent",     type: "1f", value: params.show_tangent     ?? 1   },
      { name: "u_show_integral",    type: "1f", value: params.show_integral    ?? 0   },
    ];
  },

  buildGeometry(_params: SimParams, _phase: Phase): GeometryData {
    // Full-screen quad covering NDC [-1, 1] in both axes
    const vertices = new Float32Array([
      -1, -1,
       1, -1,
       1,  1,
      -1, -1,
       1,  1,
      -1,  1,
    ]);

    const attribs: AttribDescriptor[] = [
      { name: "a_pos", size: 2, stride: 8, offset: 0 },
    ];

    return { vertices, attribs };
  },

  drawCall(_phase: Phase): DrawCall {
    return {
      mode:    0x0004 /* gl.TRIANGLES */,
      count:   6,
      indexed: false,
    };
  },
};

export default graphPlotTemplate;