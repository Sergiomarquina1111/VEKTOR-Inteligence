"use client";
import { useEffect, useRef } from "react";

export default function HeroGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl");
    if (!gl) return;

    const ext = gl.getExtension("ANGLE_instanced_arrays");
    if (!ext) return;

    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    // ── SYMBOLS from all 5 STEM domains ─────────────────────
    const SYMBOLS = [
      // Mathematics
      "∫","∑","∇","∂","∞","√","π","δ","λ","Δ","∈","∉","⊂","∩","∪","≠","≤","≥","→","⟺","∀","∃","⊗","⊕","ℝ","ℤ","ℕ",
      // Physics
      "ψ","Ψ","Φ","ℏ","α","β","γ","ω","μ","ρ","τ","η","ε₀","c²","ℓ",
      // Quantum
      "⟨","⟩","|0⟩","|1⟩","⊗","†","Û","Ĥ","σ","⟨ψ|","|ψ⟩",
      // Computer Science
      "∅","⊆","⊇","∧","∨","¬","⊻","⌈","⌊","O(n)","∝","∎","≡","≜",
      // Chemistry / Bio
      "⇌","⇒","∆G","∆H","ΔS","→","←","⇄",
    ];

    // ── Build texture atlas ──────────────────────────────────
    // Render every symbol onto a 2D canvas, pack into a grid texture
    const CELL   = 64;   // px per symbol cell
    const COLS   = 16;   // symbols per row in atlas
    const ROWS   = Math.ceil(SYMBOLS.length / COLS);
    const ATLAS_W = COLS * CELL;
    const ATLAS_H = ROWS * CELL;

    const atlasCanvas = document.createElement("canvas");
    atlasCanvas.width  = ATLAS_W;
    atlasCanvas.height = ATLAS_H;
    const ctx = atlasCanvas.getContext("2d")!;

    ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";

    SYMBOLS.forEach((sym, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cx  = col * CELL + CELL / 2;
      const cy  = row * CELL + CELL / 2;

      // Font size depends on symbol length
      const fontSize = sym.length > 2 ? 18 : sym.length > 1 ? 22 : 30;
      ctx.font = `bold ${fontSize}px "SF Mono", "Fira Code", monospace`;
      ctx.fillStyle = "#FFFFFF";
      ctx.globalAlpha = 1.0;
      ctx.fillText(sym, cx, cy);
    });

    // Upload atlas as WebGL texture
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // ── VERTEX SHADER ────────────────────────────────────────
    const VS = `
      attribute vec2  aQuadPos;
      attribute vec3  aInstancePos;
      attribute vec4  aInstanceColor;
      attribute float aInstanceSize;
      attribute float aInstancePhase;
      attribute float aInstanceSymbol;

      varying vec2  vTexCoords;
      varying vec4  vStarColor;
      varying float vVisibility;
      varying float vSymbolIdx;

      uniform mat4  uProjection;
      uniform float uTime;
      uniform float uAtlasCols;
      uniform float uAtlasRows;

      void main() {
        vec3 pos = aInstancePos;

        // Gentle sway
        float swayX = sin(uTime * 0.5 + aInstancePhase) * 3.5;
        float swayY = cos(uTime * 0.3 + aInstancePhase) * 3.5;
        pos.x += swayX;
        pos.y += swayY;

        // Slow universe rotation
        float twist = pos.z * 0.001 + (uTime * 0.018);
        float c = cos(twist);
        float s = sin(twist);
        pos.xy = vec2(pos.x * c - pos.y * s, pos.x * s + pos.y * c);

        // Perspective projection
        float distToCamera = max(-pos.z, 1.0);
        vec4 finalPos = vec4(pos, 1.0);
        finalPos.xy += aQuadPos * (aInstanceSize * (340.0 / distToCamera));
        gl_Position = uProjection * finalPos;

        // Breathing pulse
        float pulse = 0.65 + 0.35 * sin(uTime * 1.2 + aInstancePhase);

        // Fade in/out
        float fadeIn  = smoothstep(-350.0, -220.0, pos.z);
        float fadeOut = smoothstep(0.0, -55.0, pos.z);
        vVisibility = fadeIn * fadeOut * pulse;

        // UV within atlas cell
        float col = mod(aInstanceSymbol, uAtlasCols);
        float row = floor(aInstanceSymbol / uAtlasCols);
        vec2 cellUV = aQuadPos + vec2(0.5); // 0..1 within quad
        vTexCoords = vec2(
          (col + cellUV.x) / uAtlasCols,
          (row + cellUV.y) / uAtlasRows
        );

        vStarColor  = aInstanceColor;
        vSymbolIdx  = aInstanceSymbol;
      }
    `;

    // ── FRAGMENT SHADER ──────────────────────────────────────
    const FS = `
      precision mediump float;

      varying vec2  vTexCoords;
      varying vec4  vStarColor;
      varying float vVisibility;
      varying float vSymbolIdx;

      uniform sampler2D uAtlas;

      void main() {
        vec4 texel = texture2D(uAtlas, vTexCoords);

        // Use red channel as mask (white text on black)
        float mask = texel.r;

        if (mask < 0.05) discard;

        // Soft glow around the symbol
        float glow = mask * 0.85 + pow(mask, 3.0) * 0.4;

        // Color wave — heartbeat across all symbols
        vec3 color = vStarColor.rgb;

        gl_FragColor = vec4(color * 1.6, glow * vStarColor.a * vVisibility * 0.85);
      }
    `;

    // ── Compile ──────────────────────────────────────────────
    function compileShader(type: number, src: string) {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS))
        console.error(type === gl!.VERTEX_SHADER ? "VS:" : "FS:",
          gl!.getShaderInfoLog(s));
      return s;
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compileShader(gl.VERTEX_SHADER,   VS));
    gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.disable(gl.DEPTH_TEST);

    // ── Quad — 4 verts, triangle strip ───────────────────────
    const quadVerts = new Float32Array([
      -0.5,  0.5,
      -0.5, -0.5,
       0.5,  0.5,
       0.5, -0.5,
    ]);
    const quadVBO = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

    // ── Config ───────────────────────────────────────────────
    const MAX_STARS  = 6000;
    const BASE_SPEED = 14.0;
    const FAR_PLANE  = -350.0;
    const NEAR_PLANE = 1.0;
    const TUNNEL_R   = 180.0;

    // Instance layout: pos(3)+color(4)+size(1)+phase(1)+symbol(1) = 10
    const STRIDE       = 10;
    const instanceData = new Float32Array(MAX_STARS * STRIDE);
    const instanceVBO  = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceVBO);
    gl.bufferData(gl.ARRAY_BUFFER, instanceData.byteLength, gl.STREAM_DRAW);

    // ── Locations ────────────────────────────────────────────
    gl.useProgram(prog);
    const aQuadPos    = gl.getAttribLocation(prog, "aQuadPos");
    const aInstPos    = gl.getAttribLocation(prog, "aInstancePos");
    const aInstColor  = gl.getAttribLocation(prog, "aInstanceColor");
    const aInstSize   = gl.getAttribLocation(prog, "aInstanceSize");
    const aInstPhase  = gl.getAttribLocation(prog, "aInstancePhase");
    const aInstSymbol = gl.getAttribLocation(prog, "aInstanceSymbol");
    const uProj       = gl.getUniformLocation(prog, "uProjection");
    const uTime       = gl.getUniformLocation(prog, "uTime");
    const uAtlas      = gl.getUniformLocation(prog, "uAtlas");
    const uACols      = gl.getUniformLocation(prog, "uAtlasCols");
    const uARows      = gl.getUniformLocation(prog, "uAtlasRows");

    gl.uniform1i(uAtlas, 0);
    gl.uniform1f(uACols, COLS);
    gl.uniform1f(uARows, ROWS);

    // ── Domain color palettes ────────────────────────────────
    // Math → lime, Physics → cyan, Quantum → purple,
    // CS → amber, Chemistry → teal
    const DOMAIN_COLORS: [number,number,number,number][] = [
      [0.784, 1.0,   0.0,   0.9], // lime   — math
      [0.0,   0.898, 1.0,   0.9], // cyan   — physics
      [0.482, 0.361, 1.0,   0.9], // purple — quantum
      [1.0,   0.75,  0.0,   0.85],// amber  — CS
      [0.2,   0.8,   0.6,   0.85],// teal   — chem
      [1.0,   1.0,   1.0,   0.6], // white  — universal
    ];

    // Map each symbol index to a domain color
    function getSymbolColor(symIdx: number): [number,number,number,number] {
      if (symIdx < 27)  return DOMAIN_COLORS[0]; // math
      if (symIdx < 42)  return DOMAIN_COLORS[1]; // physics
      if (symIdx < 53)  return DOMAIN_COLORS[2]; // quantum
      if (symIdx < 67)  return DOMAIN_COLORS[3]; // CS
      return DOMAIN_COLORS[4];                    // chem
    }

    function rand(a: number, b: number) { return a + Math.random() * (b - a); }

    type Particle = {
      px: number; py: number; pz: number;
      cr: number; cg: number; cb: number; ca: number;
      size: number; phase: number; symIdx: number;
    };

    function spawnParticle(pz?: number): Particle {
      const angle  = rand(0, Math.PI * 2);
      const radius = rand(8, TUNNEL_R);
      const symIdx = Math.floor(Math.random() * SYMBOLS.length);
      const [cr, cg, cb, ca] = getSymbolColor(symIdx);
      return {
        px: Math.cos(angle) * radius,
        py: Math.sin(angle) * radius,
        pz: pz ?? rand(FAR_PLANE, NEAR_PLANE),
        cr, cg, cb, ca,
        size:   rand(0.6, 2.2),
        phase:  rand(0, 100),
        symIdx,
      };
    }

    const particles: Particle[] = Array.from(
      { length: MAX_STARS }, () => spawnParticle()
    );

    // ── Projection ───────────────────────────────────────────
    function buildProj(fovDeg: number, aspect: number, near: number, far: number) {
      const f  = 1.0 / Math.tan((fovDeg * Math.PI / 180) / 2);
      const nf = 1 / (near - far);
      return new Float32Array([
        f / aspect, 0, 0, 0,
        0,          f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0,
      ]);
    }

    function setProj() {
      const aspect = canvas!.width / canvas!.height;
      gl!.useProgram(prog);
      gl!.uniformMatrix4fv(uProj, false, buildProj(50, aspect, 0.1, 400));
    }
    setProj();
    window.addEventListener("resize", setProj);

    // ── Bind instance attribs ────────────────────────────────
    const BS = STRIDE * 4;
    function bindInstAttribs() {
      gl!.bindBuffer(gl!.ARRAY_BUFFER, instanceVBO);

      gl!.enableVertexAttribArray(aInstPos);
      gl!.vertexAttribPointer(aInstPos,    3, gl!.FLOAT, false, BS, 0);
      ext!.vertexAttribDivisorANGLE(aInstPos, 1);

      gl!.enableVertexAttribArray(aInstColor);
      gl!.vertexAttribPointer(aInstColor,  4, gl!.FLOAT, false, BS, 3*4);
      ext!.vertexAttribDivisorANGLE(aInstColor, 1);

      gl!.enableVertexAttribArray(aInstSize);
      gl!.vertexAttribPointer(aInstSize,   1, gl!.FLOAT, false, BS, 7*4);
      ext!.vertexAttribDivisorANGLE(aInstSize, 1);

      gl!.enableVertexAttribArray(aInstPhase);
      gl!.vertexAttribPointer(aInstPhase,  1, gl!.FLOAT, false, BS, 8*4);
      ext!.vertexAttribDivisorANGLE(aInstPhase, 1);

      gl!.enableVertexAttribArray(aInstSymbol);
      gl!.vertexAttribPointer(aInstSymbol, 1, gl!.FLOAT, false, BS, 9*4);
      ext!.vertexAttribDivisorANGLE(aInstSymbol, 1);
    }

    // ── Render loop ──────────────────────────────────────────
    let lastT  = performance.now() / 1000;
    let animId: number;

    function draw() {
      const now = performance.now() / 1000;
      const dt  = Math.min(now - lastT, 0.05);
      lastT = now;

      gl!.clearColor(0.0, 0.005, 0.02, 1.0);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      gl!.useProgram(prog);
      gl!.uniform1f(uTime, now);

      // Bind texture atlas
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, tex);

      // Update particles
      for (let i = 0; i < MAX_STARS; i++) {
        const p = particles[i];
        p.pz += BASE_SPEED * dt;

        if (p.pz > NEAR_PLANE) {
          const angle  = rand(0, Math.PI * 2);
          const radius = rand(8, TUNNEL_R);
          const symIdx = Math.floor(Math.random() * SYMBOLS.length);
          const [cr, cg, cb, ca] = getSymbolColor(symIdx);
          p.pz     = FAR_PLANE;
          p.px     = Math.cos(angle) * radius;
          p.py     = Math.sin(angle) * radius;
          p.cr = cr; p.cg = cg; p.cb = cb; p.ca = ca;
          p.size   = rand(0.6, 2.2);
          p.phase  = rand(0, 100);
          p.symIdx = symIdx;
        }

        const b = i * STRIDE;
        instanceData[b+0] = p.px;
        instanceData[b+1] = p.py;
        instanceData[b+2] = p.pz;
        instanceData[b+3] = p.cr;
        instanceData[b+4] = p.cg;
        instanceData[b+5] = p.cb;
        instanceData[b+6] = p.ca;
        instanceData[b+7] = p.size;
        instanceData[b+8] = p.phase;
        instanceData[b+9] = p.symIdx;
      }

      // Bind quad
      gl!.bindBuffer(gl!.ARRAY_BUFFER, quadVBO);
      gl!.enableVertexAttribArray(aQuadPos);
      gl!.vertexAttribPointer(aQuadPos, 2, gl!.FLOAT, false, 0, 0);
      ext!.vertexAttribDivisorANGLE(aQuadPos, 0);

      // Upload + draw
      gl!.bindBuffer(gl!.ARRAY_BUFFER, instanceVBO);
      gl!.bufferSubData(gl!.ARRAY_BUFFER, 0, instanceData);
      bindInstAttribs();

      ext!.drawArraysInstancedANGLE(gl!.TRIANGLE_STRIP, 0, 4, MAX_STARS);

      animId = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("resize", setProj);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ display: "block" }}
    />
  );
}