#version 300 es
precision highp float;

uniform float u_time;
uniform float u_phase;
uniform int   u_domain;
uniform int   u_tier;
uniform float u_params[8];
uniform float u_expert[8];
uniform vec2  u_resolution;
uniform sampler2D u_noise;

out vec4 fragColor;

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
float param(int i) {
  return mix(u_params[i], u_expert[i], u_phase);
}

vec3 tierColor() {
  if (u_tier == 1) return vec3(0.784, 1.000, 0.000);   // lime  T1
  if (u_tier == 2) return vec3(1.000, 0.722, 0.000);   // amber T2
  if (u_tier == 3) return vec3(1.000, 0.239, 0.341);   // coral T3
  return vec3(0.482, 0.361, 1.000);                     // purple T4
}

vec3 phaseColor() {
  if (u_phase < 0.5) return vec3(1.000, 0.239, 0.341); // coral = student
  return vec3(0.784, 1.000, 0.000);                     // lime  = expert
}

float sdLine(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa,ba)/dot(ba,ba), 0.0, 1.0);
  return length(pa - ba * h);
}

float sdCircle(vec2 p, float r) { return length(p) - r; }

float glow(float d, float r, float k) {
  return r / (1.0 + (d/k)*(d/k));
}

// Hash for pseudo-random
float hash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 17.5);
  return fract(p.x * p.y);
}

// Simple 2D FBM — used only in DOMAIN_GENERIC
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * sin(p.x + u_time * 0.3) * cos(p.y + u_time * 0.2);
    p = p * 2.0 + vec2(1.7, 0.9);
    a *= 0.5;
  }
  return v;
}

// ─────────────────────────────────────────────
// DOMAIN 0 — WAVE
// params: [frequency, amplitude, phase_shift, damping, wave_type(0=trans,1=long), show_nodes, ...]
// ─────────────────────────────────────────────
vec3 domainWave(vec2 uv) {
  float freq    = mix(1.0, 4.0, param(0));
  float amp     = mix(0.1, 0.5, param(1));
  float phi     = param(2) * 6.283;
  float damping = param(3);
  float wtype   = param(4); // 0=transverse, 1=longitudinal

  vec3 col = vec3(0.0);
  float lineW = 0.012;

  if (wtype < 0.5) {
    // Transverse wave — sine curve
    float y = amp * sin(freq * uv.x * 6.283 - u_time * 2.5 + phi);
    y *= exp(-damping * abs(uv.x));
    float dist = abs(uv.y - y);
    float line = smoothstep(lineW * 2.0, lineW * 0.5, dist);
    col += phaseColor() * line;
    col += phaseColor() * glow(dist, 0.15, 0.05);
  } else {
    // Longitudinal — compression bands
    float compress = sin(freq * uv.x * 6.283 - u_time * 2.5 + phi);
    compress *= exp(-damping * abs(uv.x));
    float band = 0.5 + 0.5 * compress;
    col += phaseColor() * band * 0.6;
    // Show individual longitudinal "molecules"
    for (float i = -8.0; i <= 8.0; i += 1.0) {
      float baseX = i / 8.0;
      float disp = amp * sin(freq * baseX * 6.283 - u_time * 2.5 + phi);
      vec2 pos = vec2(baseX + disp * 0.3, 0.0);
      float d = sdCircle(uv - pos, 0.025);
      col += phaseColor() * smoothstep(0.025, 0.010, d);
    }
  }

  // Standing wave nodes if show_nodes
  if (param(5) > 0.5) {
    for (float i = 0.0; i <= freq; i += 1.0) {
      float nx = (2.0 * i - freq) / (freq * 2.0);
      float d = sdCircle(uv - vec2(nx, 0.0), 0.018);
      col += vec3(1.0, 0.9, 0.3) * smoothstep(0.018, 0.005, d);
    }
  }

  return col;
}

// ─────────────────────────────────────────────
// DOMAIN 1 — FIELD
// params: [charge_sign, field_strength, num_lines, show_potential, ...]
// ─────────────────────────────────────────────
vec3 domainField(vec2 uv) {
  float sign1   = param(0) > 0.5 ? 1.0 : -1.0;
  float strength = mix(0.5, 2.0, param(1));
  float numL    = mix(4.0, 12.0, param(2));

  vec3 col = vec3(0.0);

  // Source charge
  vec2 src = vec2(-0.25, 0.0);
  vec2 src2 = vec2(0.25, 0.0);

  // Field lines
  float count = floor(numL);
  for (float i = 0.0; i < 12.0; i++) {
    if (i >= count) break;
    float angle = (i / count) * 6.283 + u_time * 0.2;
    vec2 dir = vec2(cos(angle), sin(angle));

    // Draw field line from source
    for (float t = 0.01; t < 1.0; t += 0.015) {
      vec2 p = src + dir * t * strength;
      // Bend toward/away from second charge
      vec2 toSrc2 = src2 - p;
      float dist2 = length(toSrc2);
      p += normalize(toSrc2) * sign1 * 0.01 / (dist2 * dist2 + 0.01);

      float d = sdCircle(uv - p, 0.006);
      col += phaseColor() * smoothstep(0.008, 0.002, d) * (1.0 - t);
    }
  }

  // Draw charges
  float d1 = sdCircle(uv - src, 0.035);
  float d2 = sdCircle(uv - src2, 0.035);
  col += vec3(0.9, 0.2, 0.2) * smoothstep(0.035, 0.020, d1);
  col += vec3(0.2, 0.5, 0.9) * smoothstep(0.035, 0.020, d2);

  // Potential surface
  if (param(3) > 0.5) {
    float pot = 0.0;
    pot += 1.0 / (length(uv - src) + 0.05);
    pot -= sign1 / (length(uv - src2) + 0.05);
    float ring = fract(pot * 0.4);
    col += phaseColor() * 0.15 * smoothstep(0.1, 0.05, abs(ring - 0.5));
  }

  return col;
}

// ─────────────────────────────────────────────
// DOMAIN 2 — PARTICLE
// params: [num_particles, temperature, bond_angle(0-1), show_bonds, molecule_type, ...]
// ─────────────────────────────────────────────
vec3 domainParticle(vec2 uv) {
  float temp     = mix(0.1, 1.0, param(1));
  float bondAngle = mix(0.5, 1.0, param(2)); // 0.5=90deg, 1.0=109.5deg
  float showBonds = param(3);
  float mtype    = param(4); // 0=gas, 1=molecule, 2=electron_cloud

  vec3 col = vec3(0.0);

  if (mtype < 0.5) {
    // Gas molecules — random bouncing particles
    float N = mix(6.0, 20.0, param(0));
    for (float i = 0.0; i < 20.0; i++) {
      if (i >= N) break;
      float hx = hash(vec2(i, 1.3));
      float hy = hash(vec2(i, 2.7));
      float vx = (hash(vec2(i, 3.1)) - 0.5) * 2.0;
      float vy = (hash(vec2(i, 4.5)) - 0.5) * 2.0;

      float speed = temp * 0.5;
      vec2 pos = vec2(
        fract(hx + vx * speed * u_time * 0.1) * 1.8 - 0.9,
        fract(hy + vy * speed * u_time * 0.1) * 1.8 - 0.9
      );
      float d = sdCircle(uv - pos, 0.030);
      col += phaseColor() * smoothstep(0.030, 0.012, d);
      col += phaseColor() * glow(max(0.0, d), 0.08, 0.04);
    }
  } else if (mtype < 1.5) {
    // VSEPR molecule — center atom + ligands at bond angle
    vec2 center = vec2(0.0);
    float dCenter = sdCircle(uv - center, 0.05);
    col += vec3(0.8, 0.3, 0.1) * smoothstep(0.05, 0.025, dCenter);

    // Bond angle: 90° = π/2, 104.5° = 1.824 rad, 109.5° = 1.911 rad
    float angle = mix(1.5708, 1.9106, bondAngle - 0.5) * 2.0;
    vec2 a1 = vec2(cos(-angle*0.5), sin(-angle*0.5)) * 0.25;
    vec2 a2 = vec2(cos( angle*0.5), sin( angle*0.5)) * 0.25;
    float d1 = sdCircle(uv - a1, 0.04);
    float d2 = sdCircle(uv - a2, 0.04);
    col += vec3(0.2, 0.6, 0.9) * smoothstep(0.04, 0.015, d1);
    col += vec3(0.2, 0.6, 0.9) * smoothstep(0.04, 0.015, d2);

    if (showBonds > 0.5) {
      float bl1 = sdLine(uv, center, a1);
      float bl2 = sdLine(uv, center, a2);
      col += vec3(0.7) * smoothstep(0.008, 0.003, bl1);
      col += vec3(0.7) * smoothstep(0.008, 0.003, bl2);
    }

    // Lone pair indicator (electron cloud above/below)
    vec2 lp1 = vec2(0.0,  0.18);
    vec2 lp2 = vec2(0.0, -0.18);
    float dlp1 = sdCircle(uv - lp1, 0.06);
    float dlp2 = sdCircle(uv - lp2, 0.06);
    col += vec3(0.6, 0.3, 0.8) * 0.3 * smoothstep(0.06, 0.03, dlp1);
    col += vec3(0.6, 0.3, 0.8) * 0.3 * smoothstep(0.06, 0.03, dlp2);
  }

  return col;
}

// ─────────────────────────────────────────────
// DOMAIN 3 — ORBITAL
// params: [eccentricity, semi_major, speed_model(0=const,1=kepler), show_sweep, ...]
// ─────────────────────────────────────────────
vec3 domainOrbital(vec2 uv) {
  float ecc      = mix(0.0, 0.8, param(0));
  float a        = mix(0.3, 0.65, param(1));  // semi-major axis
  float kepler   = param(2);                  // 0=constant speed, 1=Kepler
  float showSweep = param(3);

  vec3 col = vec3(0.0);

  float b = a * sqrt(1.0 - ecc * ecc);
  float c = a * ecc;  // focus offset
  vec2 focus = vec2(-c, 0.0);

  // Draw orbit ellipse using analytical ellipse SDF
  // d = |d1 + d2 - 2a| / 2  where d1,d2 = distances to foci
  vec2 f1 = vec2(-c, 0.0);
  vec2 f2 = vec2( c, 0.0);
  float d1 = length(uv - f1);
  float d2 = length(uv - f2);
  float ellipseD = abs(d1 + d2 - 2.0 * a) * 0.5;
  float orbitLine = smoothstep(0.012, 0.003, ellipseD);
  col += vec3(0.3, 0.5, 0.7) * orbitLine;

  // Planet position — eccentric anomaly (simplified Kepler)
  float M = u_time * 1.2; // mean anomaly
  float E = M;
  for (int i = 0; i < 5; i++) {
    E = M + ecc * sin(E);
  }
  float trueAnomaly;
  if (kepler > 0.5) {
    // True anomaly from eccentric anomaly
    float cosE = cos(E);
    trueAnomaly = 2.0 * atan(sqrt((1.0 + ecc) / (1.0 - ecc + 0.0001)) * tan(E * 0.5));
  } else {
    // Constant speed: true anomaly = mean anomaly
    trueAnomaly = M;
    E = trueAnomaly;
    // But keep on ellipse
  }
  float r = a * (1.0 - ecc * cos(E));
  vec2 planetPos = focus + vec2(r * cos(trueAnomaly), r * sin(trueAnomaly));

  // Trail (past 32 positions)
  for (float i = 1.0; i <= 32.0; i++) {
    float pastM = M - i * 0.06;
    float pastE = pastM;
    for (int j = 0; j < 3; j++) pastE = pastM + ecc * sin(pastE);
    float pastTA = kepler > 0.5
      ? 2.0 * atan(sqrt((1.0 + ecc) / (1.0 - ecc + 0.0001)) * tan(pastE * 0.5))
      : pastM;
    float pastR = a * (1.0 - ecc * cos(pastE));
    vec2 pp = focus + vec2(pastR * cos(pastTA), pastR * sin(pastTA));
    float td = sdCircle(uv - pp, 0.008);
    col += phaseColor() * 0.6 * (1.0 - i / 32.0) * smoothstep(0.010, 0.003, td);
  }

  // Equal area sweep visualization
  if (showSweep > 0.5) {
    float sweepA = trueAnomaly - 0.4;
    float sweepR = a * (1.0 - ecc * ecc) / (1.0 + ecc * cos(sweepA));
    vec2 sweepPt1 = focus + vec2(sweepR * cos(sweepA), sweepR * sin(sweepA));
    float sl1 = sdLine(uv, focus, sweepPt1);
    float sl2 = sdLine(uv, focus, planetPos);
    col += vec3(0.784, 1.0, 0.0) * 0.4 * smoothstep(0.004, 0.001, sl1);
    col += vec3(0.784, 1.0, 0.0) * 0.4 * smoothstep(0.004, 0.001, sl2);
  }

  // Star at focus
  float starD = sdCircle(uv - focus, 0.045);
  col += vec3(1.0, 0.95, 0.6) * smoothstep(0.045, 0.020, starD);
  col += vec3(1.0, 0.8, 0.2) * glow(max(0.0, starD + 0.045), 0.25, 0.12);

  // Planet
  float pd = sdCircle(uv - planetPos, 0.028);
  col += phaseColor() * smoothstep(0.028, 0.010, pd);
  col += phaseColor() * glow(max(0.0, pd + 0.028), 0.10, 0.05);

  // Starfield
  for (float i = 0.0; i < 24.0; i++) {
    vec2 sc = vec2(hash(vec2(i, 7.3)), hash(vec2(i, 13.7))) * 2.0 - 1.0;
    float sd2 = sdCircle(uv - sc, 0.005);
    float brightness = hash(vec2(i, 3.14)) * 0.5 + 0.2;
    col += vec3(brightness) * smoothstep(0.005, 0.001, sd2);
  }

  return col;
}

// ─────────────────────────────────────────────
// DOMAIN 4 — TRANSFORM
// params: [mat_a, mat_b, mat_c, mat_d, eigenval1, eigenval2, show_eigen, ...]
// ─────────────────────────────────────────────
vec3 domainTransform(vec2 uv) {
  float ma = param(0);
  float mb = param(1);
  float mc = param(2);
  float md = param(3);
  float ev1 = param(4);
  float ev2 = param(5);
  float showEigen = param(6);

  vec3 col = vec3(0.0);
  float lineW = 0.006;

  // Grid lines — both original and transformed
  // Transform matrix: [[ma, mb], [mc, md]]
  float gridAlpha = 0.18;
  for (float i = -4.0; i <= 4.0; i += 1.0) {
    // Vertical grid lines
    vec2 p0 = vec2(i * 0.25, -1.0);
    vec2 p1 = vec2(i * 0.25,  1.0);
    // Transform
    vec2 tp0 = vec2(ma * p0.x + mb * p0.y, mc * p0.x + md * p0.y) * 0.35;
    vec2 tp1 = vec2(ma * p1.x + mb * p1.y, mc * p1.x + md * p1.y) * 0.35;

    // Interpolate based on phase
    vec2 dp0 = mix(p0 * 0.35, tp0, u_phase);
    vec2 dp1 = mix(p1 * 0.35, tp1, u_phase);
    float dl = sdLine(uv, dp0, dp1);
    col += vec3(0.2, 0.4, 0.8) * gridAlpha * smoothstep(lineW, lineW * 0.3, dl);

    // Horizontal grid lines
    vec2 h0 = vec2(-1.0, i * 0.25);
    vec2 h1 = vec2( 1.0, i * 0.25);
    vec2 th0 = vec2(ma * h0.x + mb * h0.y, mc * h0.x + md * h0.y) * 0.35;
    vec2 th1 = vec2(ma * h1.x + mb * h1.y, mc * h1.x + md * h1.y) * 0.35;
    vec2 dh0 = mix(h0 * 0.35, th0, u_phase);
    vec2 dh1 = mix(h1 * 0.35, th1, u_phase);
    float hl = sdLine(uv, dh0, dh1);
    col += vec3(0.8, 0.2, 0.4) * gridAlpha * smoothstep(lineW, lineW * 0.3, hl);
  }

  // Basis vectors
  vec2 ihat_orig = vec2(0.3, 0.0);
  vec2 jhat_orig = vec2(0.0, 0.3);
  vec2 ihat_t = vec2(ma * ihat_orig.x + mb * ihat_orig.y, mc * ihat_orig.x + md * ihat_orig.y) * 0.35;
  vec2 jhat_t = vec2(ma * jhat_orig.x + mb * jhat_orig.y, mc * jhat_orig.x + md * jhat_orig.y) * 0.35;

  vec2 dihat = mix(ihat_orig * 0.35, ihat_t, u_phase);
  vec2 djhat = mix(jhat_orig * 0.35, jhat_t, u_phase);

  float il = sdLine(uv, vec2(0.0), dihat);
  float jl = sdLine(uv, vec2(0.0), djhat);
  col += vec3(0.2, 0.8, 0.4) * smoothstep(0.008, 0.002, il);
  col += vec3(0.9, 0.6, 0.1) * smoothstep(0.008, 0.002, jl);

  // Eigenvectors
  if (showEigen > 0.5) {
    vec2 e1dir = normalize(vec2(1.0, (ev1 - ma) / (mb + 0.0001)));
    vec2 e2dir = normalize(vec2(-(md - ev2) / (mc + 0.0001), 1.0));
    float el1 = sdLine(uv, -e1dir * 0.55, e1dir * 0.55);
    float el2 = sdLine(uv, -e2dir * 0.55, e2dir * 0.55);
    col += vec3(1.0, 1.0, 0.3) * 0.7 * smoothstep(0.007, 0.002, el1);
    col += vec3(0.3, 1.0, 1.0) * 0.7 * smoothstep(0.007, 0.002, el2);
  }

  // Origin dot
  float od = sdCircle(uv, 0.012);
  col += vec3(1.0) * smoothstep(0.012, 0.004, od);

  return col;
}

// ─────────────────────────────────────────────
// DOMAIN 5 — FUNCTION (MATHEMATICS PRECISION)
// Clean textbook-style rendering — NO FBM, NO BLOBS
// params:
//   [0] func_type:     0=sine, 1=cubic, 2=parabola, 3=abs
//   [1] show_tangent:  0/1
//   [2] deriv_scale:   tangent slope multiplier (0.5=wrong, 1.0=correct)
//   [3] show_integral: 0/1
//   [4] amplitude:     vertical scale
//   [5] show_deriv_curve: 0/1 — show f'(x) as cyan overlay
//   [6] tangent_x:     x position of tangent dot (canvas coords)
//   [7] show_critical: 0/1
// ─────────────────────────────────────────────
vec3 domainFunction(vec2 uv) {
  vec3 col = vec3(0.0);

  // Read params
  float funcType   = param(0);
  float showTan    = param(1);
  float derivScale = param(2);
  float showInteg  = param(3);
  float amp        = mix(0.4, 0.9, param(4));
  float showDeriv  = param(5);
  float tanX       = mix(-0.6, 0.6, param(6));
  float showCrit   = param(7);

  // Crisp line width — NO GLOW RADIUS, NO BLOB
  float lineW = 0.011;

  // Aspect ratio of this canvas half
  float ar = u_resolution.x / u_resolution.y;

  // ── coordinate space ──────────────────────
  // uv is in [-1,1] x [-1,1] (NDC, y-up)
  // We map: world x in [-ar, ar], world y in [-1,1]
  float wx = uv.x * ar;
  float wy = uv.y;

  // ── Evaluate function at world x ──────────
  float PI = 3.14159265;
  float xn = wx * PI * 0.8; // normalized input

  float v = 0.0;
  if (funcType < 0.5) {
    v = amp * sin(xn);
  } else if (funcType < 1.5) {
    float k = xn / PI;
    v = amp * (k * k * k - k);
  } else if (funcType < 2.5) {
    float k = xn / PI;
    v = amp * k * k;
  } else {
    v = amp * (abs(xn / PI) - 0.3);
  }

  // ── AXES ──────────────────────────────────
  float xAxis = sdLine(uv, vec2(-1.0, 0.0), vec2(1.0, 0.0));
  float yAxis = sdLine(uv, vec2(0.0, -1.0), vec2(0.0, 1.0));
  float axisW = lineW * 0.6;
  col += vec3(0.25) * smoothstep(axisW, axisW * 0.3, xAxis);
  col += vec3(0.25) * smoothstep(axisW, axisW * 0.3, yAxis);

  // Tick marks
  for (float t = -4.0; t <= 4.0; t += 1.0) {
    float tx = t * 0.25;
    float tickD = sdLine(uv, vec2(tx, -0.02), vec2(tx, 0.02));
    col += vec3(0.2) * smoothstep(0.003, 0.001, tickD);
  }

  // ── INTEGRAL SHADING ──────────────────────
  if (showInteg > 0.5) {
    // Shade area under curve from x=-0.5 to x=0.5
    float integX0 = -0.5 / ar;
    float integX1 =  0.5 / ar;
    if (uv.x > integX0 && uv.x < integX1) {
      if ((wy > 0.0 && wy < v) || (wy < 0.0 && wy > v)) {
        col += phaseColor() * 0.18;
      }
    }
  }

  // ── MAIN FUNCTION CURVE ───────────────────
  // Sample neighboring x to measure curve distance analytically
  float eps = 0.002;
  float xnL = (uv.x - eps) * ar * PI * 0.8;
  float xnR = (uv.x + eps) * ar * PI * 0.8;

  float vL = 0.0, vR = 0.0;
  if (funcType < 0.5) {
    vL = amp * sin(xnL); vR = amp * sin(xnR);
  } else if (funcType < 1.5) {
    float kL = xnL/PI, kR = xnR/PI;
    vL = amp*(kL*kL*kL-kL); vR = amp*(kR*kR*kR-kR);
  } else if (funcType < 2.5) {
    float kL = xnL/PI, kR = xnR/PI;
    vL = amp*kL*kL; vR = amp*kR*kR;
  } else {
    vL = amp*(abs(xnL/PI)-0.3); vR = amp*(abs(xnR/PI)-0.3);
  }

  // Distance to curve = |wy - v| / sqrt(1 + (dv/dx)²)
  float dydx = (vR - vL) / (2.0 * eps * ar);
  float curveDist = abs(wy - v) / sqrt(1.0 + dydx * dydx);

  float curveLine = smoothstep(lineW * 2.0, lineW * 0.3, curveDist);
  float haloLine  = smoothstep(lineW * 3.5, lineW * 0.8, curveDist) * 0.10;
  col += phaseColor() * curveLine;
  col += phaseColor() * haloLine;

  // ── TANGENT LINE ──────────────────────────
  if (showTan > 0.5) {
    // Evaluate function and derivative at tanX
    float tanXn = tanX * ar * PI * 0.8;
    float tanV = 0.0;
    float tanDeriv = 0.0;

    if (funcType < 0.5) {
      tanV = amp * sin(tanXn);
      tanDeriv = amp * cos(tanXn) * ar * PI * 0.8;
    } else if (funcType < 1.5) {
      float k = tanXn / PI;
      tanV = amp * (k*k*k - k);
      tanDeriv = amp * (3.0*k*k - 1.0) * ar;
    } else if (funcType < 2.5) {
      float k = tanXn / PI;
      tanV = amp * k * k;
      // derivScale controls how the student scales the tangent slope
      // 1.0 = correct (2k * amp * ar), 0.5 = wrong (k * amp * ar)
      tanDeriv = derivScale * 2.0 * amp * k * ar;
    } else {
      float k = tanXn / PI;
      tanV = amp * (abs(k) - 0.3);
      tanDeriv = amp * sign(tanXn) * ar;
    }

    // Tangent: y = tanV + tanDeriv * (x - tanX)
    // => wy = tanV + tanDeriv * (uv.x - tanX)
    // => distance = |wy - tanV - tanDeriv*(uv.x - tanX)| / sqrt(1 + tanDeriv²)
    float tanDist = abs(wy - tanV - tanDeriv * (uv.x - tanX))
                   / sqrt(1.0 + tanDeriv * tanDeriv);

    // Clip tangent: only draw in x-range AND y-range to prevent canvas exit
    float inRangeX = step(abs(uv.x - tanX), 0.38 * ar);
    float tanY_at_edge = tanV + tanDeriv * (0.38 * ar);
    float inRangeY = step(abs(tanY_at_edge), 0.92);
    float inRange = inRangeX * inRangeY;

    float tanLine = smoothstep(lineW * 2.0, lineW * 0.3, tanDist) * inRange;
    vec3 tanColor = vec3(1.0, 0.72, 0.0); // amber
    col += tanColor * tanLine;
    col += tanColor * 0.08 * smoothstep(lineW * 4.0, 0.0, tanDist) * inRange;

    // Tangent contact dot
    vec2 contactPt = vec2(tanX, tanV);
    float dotD = sdCircle(uv - contactPt, 0.018);
    col += tanColor * smoothstep(0.018, 0.007, dotD);
  }

  // ── DERIVATIVE CURVE OVERLAY (cyan) ───────
  if (showDeriv > 0.5) {
    float derivV = 0.0;
    if (funcType < 0.5) {
      derivV = amp * cos(xn) * 0.5;  // scaled for readability
    } else if (funcType < 1.5) {
      float k = xn / PI;
      derivV = amp * (3.0*k*k - 1.0) * 0.5;
    } else if (funcType < 2.5) {
      float k = xn / PI;
      derivV = amp * 2.0 * k * 0.5;  // f'(x)=2x, scaled ×0.5
    } else {
      derivV = amp * sign(xn) * 0.5;
    }

    float dDerivdx = 0.0;
    float xnL2 = (uv.x - eps) * ar * PI * 0.8;
    float xnR2 = (uv.x + eps) * ar * PI * 0.8;
    float dvL = 0.0, dvR = 0.0;
    if (funcType < 2.5 && funcType >= 1.5) {
      dvL = amp * 2.0 * (xnL2/PI) * 0.5;
      dvR = amp * 2.0 * (xnR2/PI) * 0.5;
    } else if (funcType < 0.5) {
      dvL = amp * cos(xnL2) * 0.5;
      dvR = amp * cos(xnR2) * 0.5;
    }
    dDerivdx = (dvR - dvL) / (2.0 * eps * ar);

    float derivDist = abs(wy - derivV) / sqrt(1.0 + dDerivdx * dDerivdx);
    float derivLine = smoothstep(lineW * 1.8, lineW * 0.3, derivDist);
    col += vec3(0.0, 0.9, 1.0) * derivLine * 0.85; // cyan
    col += vec3(0.0, 0.9, 1.0) * 0.06 * smoothstep(lineW * 3.5, 0.0, derivDist);
  }

  // ── CRITICAL POINTS ───────────────────────
  if (showCrit > 0.5) {
    // For parabola: critical point at x=0
    if (funcType >= 1.5 && funcType < 2.5) {
      float critV = 0.0;
      vec2 critPt = vec2(0.0, critV);
      float cd = sdCircle(uv - critPt, 0.020);
      col += vec3(1.0, 1.0, 0.0) * smoothstep(0.020, 0.007, cd);
    }
  }

  return col;
}

// ─────────────────────────────────────────────
// DOMAIN 6 — GENERIC FALLBACK
// Force-directed concept graph: student=flat, expert=hierarchical
// ─────────────────────────────────────────────
vec3 domainGeneric(vec2 uv) {
  float nodeCount = mix(4.0, 10.0, param(0));
  float hierarchy = param(1); // 0=flat, 1=hierarchical

  vec3 col = vec3(0.0);

  float N = floor(nodeCount);
  for (float i = 0.0; i < 10.0; i++) {
    if (i >= N) break;
    float h1 = hash(vec2(i, 1.1));
    float h2 = hash(vec2(i, 2.2));

    vec2 flatPos = vec2(h1 * 1.6 - 0.8, h2 * 1.6 - 0.8);

    // Hierarchical: arrange in tier rows
    float tier = floor(i / 3.0);
    float posInTier = mod(i, 3.0);
    float tiersTotal = ceil(N / 3.0);
    vec2 hierPos = vec2(
      (posInTier - 1.0) * 0.4,
      0.6 - tier / tiersTotal * 1.2
    );

    // Drift in flat mode
    flatPos += vec2(
      sin(u_time * 0.4 + h1 * 6.283) * 0.03,
      cos(u_time * 0.3 + h2 * 6.283) * 0.03
    );

    vec2 pos = mix(flatPos, hierPos, hierarchy);

    // Edges to neighbors
    if (i > 0.0) {
      float j = i - 1.0;
      float jh1 = hash(vec2(j, 1.1));
      float jh2 = hash(vec2(j, 2.2));
      vec2 jfp = vec2(jh1 * 1.6 - 0.8, jh2 * 1.6 - 0.8);
      float jtier = floor(j / 3.0);
      float jpitier = mod(j, 3.0);
      vec2 jhp = vec2((jpitier - 1.0) * 0.4, 0.6 - jtier / tiersTotal * 1.2);
      vec2 jpos = mix(jfp, jhp, hierarchy);

      float edgeD = sdLine(uv, pos, jpos);
      col += phaseColor() * 0.3 * smoothstep(0.007, 0.002, edgeD);
    }

    // Node
    float nodeSize = hierarchy > 0.5 ? (0.03 + 0.01 * (1.0 - tier / tiersTotal)) : 0.03;
    float nd = sdCircle(uv - pos, nodeSize);
    col += phaseColor() * smoothstep(nodeSize, nodeSize * 0.3, nd);
    col += phaseColor() * 0.2 * glow(max(0.0, nd), 0.08, 0.04);
  }

  return col;
}

// ─────────────────────────────────────────────
// BACKGROUND & VIGNETTE
// ─────────────────────────────────────────────
vec3 background(vec2 uv) {
  // Very subtle base — nearly pure dark, no FBM blob
  vec3 base = vec3(0.031, 0.031, 0.059); // #080815
  float vignette = 1.0 - dot(uv * 0.8, uv * 0.8);
  vignette = clamp(vignette, 0.0, 1.0);
  return base * (0.7 + 0.3 * vignette);
}

// ─────────────────────────────────────────────
// BORDER GLOW — tier color on canvas edge
// ─────────────────────────────────────────────
vec3 borderGlow(vec2 uv) {
  float edgeDist = min(min(1.0 - abs(uv.x), 1.0 - abs(uv.y)), 1.0);
  float border = smoothstep(0.15, 0.0, edgeDist) * 0.35;
  return tierColor() * border;
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────
void main() {
  // NDC coordinates: [-1, 1] x [-1, 1], y-up
  vec2 uv = (gl_FragCoord.xy / u_resolution) * 2.0 - 1.0;
  uv.y = -uv.y; // flip Y so positive is up

  vec3 col = background(uv);

  if      (u_domain == 0) col += domainWave(uv);
  else if (u_domain == 1) col += domainField(uv);
  else if (u_domain == 2) col += domainParticle(uv);
  else if (u_domain == 3) col += domainOrbital(uv);
  else if (u_domain == 4) col += domainTransform(uv);
  else if (u_domain == 5) col += domainFunction(uv);
  else                    col += domainGeneric(uv);

  col += borderGlow(uv);

  // Tone map + gamma
  col = col / (1.0 + col);
  col = pow(max(col, vec3(0.0)), vec3(0.4545));

  fragColor = vec4(col, 1.0);
}
