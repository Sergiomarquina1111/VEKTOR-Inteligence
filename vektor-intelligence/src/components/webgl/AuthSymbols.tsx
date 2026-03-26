"use client";
import { useEffect, useRef } from "react";

export default function AuthSymbols() {
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

    const SYMBOLS = [
      "∫","∬","∑","∏","∇","∂","∞","√","π","δ","λ","Δ","Ω","Θ","Σ","Φ","Ψ",
      "α","β","γ","ε","η","θ","μ","ν","ρ","σ","τ","φ","χ","ψ","ω",
      "∈","∉","⊂","⊆","∩","∪","∅","∀","∃","∧","∨","¬","⊢","⊨",
      "→","↔","⇒","⇔","⟹","⟺","ℕ","ℤ","ℚ","ℝ","ℂ","ℵ",
      "≠","≡","≈","≅","≤","≥","⊗","⊕","×","±","∝","∘","⋆",
      "lim","det","ker","dx","dy","dt",
      "ℏ","c²","E=mc²","∇²","∇×","ΔS","ΔH","ΔG","p=mv",
      "|ψ⟩","⟨ψ|","|0⟩","|1⟩","|+⟩","Ĥ","σₓ","σᵧ","ℏω","⟨E⟩","CNOT",
      "∂_μ","g_μν","R_μν","G_μν","ds²","∇_μ",
      "⇌","ΔG°","Ka","pH","sp³","SN1","SN2",
      "O(1)","O(n)","O(log n)","λx","P≠NP","Θ(n)","AND","XOR",
      "H(X)","D_KL","log₂p","ζ(s)","e^iπ+1=0","φ(n)","gcd",
      "π₁(X)","H_n(X)","M☉","H₀","Ω_Λ","V=IR","H(jω)","FFT",
      "e","π","φ","γ","i","ℵ₀","G","c","ħ","kB",
      "GL(n)","SU(n)","ker f","F:𝒞→𝒟","AdS/CFT","M-theory","α'",
    ];

    // Build texture atlas
    const CELL = 64, COLS = 16;
    const ROWS = Math.ceil(SYMBOLS.length / COLS);
    const ac = document.createElement("canvas");
    ac.width = COLS * CELL;
    ac.height = ROWS * CELL;
    const ctx = ac.getContext("2d")!;
    ctx.clearRect(0, 0, ac.width, ac.height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#FFFFFF";

    SYMBOLS.forEach((sym, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const fs = sym.length > 6 ? 11 : sym.length > 4 ? 13
               : sym.length > 2 ? 17 : sym.length > 1 ? 22 : 30;
      ctx.font = `bold ${fs}px "SF Mono","Fira Code","Consolas",monospace`;
      ctx.fillText(sym, col * CELL + CELL / 2, row * CELL + CELL / 2);
    });

    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ac);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const VS = `
      attribute vec2  aQuadPos;
      attribute vec2  aPos;
      attribute vec2  aVel;
      attribute float aSize;
      attribute float aPhase;
      attribute float aSymbol;
      attribute float aRotSpeed;
      attribute vec4  aColor;
      varying vec2  vUV;
      varying vec4  vColor;
      varying float vAlpha;
      uniform vec2  uRes;
      uniform float uTime;
      uniform float uCols;
      uniform float uRows;

      void main() {
        vec2 center = mod(aPos + aVel * uTime, uRes);
        float angle = uTime * aRotSpeed + aPhase;
        float c = cos(angle); float s = sin(angle);
        vec2 rotQ = vec2(
          aQuadPos.x * c - aQuadPos.y * s,
          aQuadPos.x * s + aQuadPos.y * c
        );
        float pulse = 0.72 + 0.28 * sin(uTime * 1.1 + aPhase);
        vec2 pos = center + rotQ * aSize * pulse;
        vec2 clip = (pos / uRes) * 2.0 - 1.0;
        gl_Position = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);

        float col = mod(aSymbol, uCols);
        float row = floor(aSymbol / uCols);
        vec2 cell = aQuadPos + vec2(0.5);
        vUV = vec2((col + cell.x) / uCols, (row + cell.y) / uRows);

        vec2 edgeDist = min(center, uRes - center) / uRes;
        float edgeFade = smoothstep(0.0, 0.05, min(edgeDist.x, edgeDist.y));
        float wave = 0.65 + 0.35 * sin(uTime * 0.4 + aPhase * 0.3);
        vColor = vec4(aColor.rgb * wave, aColor.a);
        vAlpha = edgeFade * pulse;
      }
    `;

    const FS = `
      precision mediump float;
      varying vec2  vUV;
      varying vec4  vColor;
      varying float vAlpha;
      uniform sampler2D uAtlas;

      void main() {
        float mask = texture2D(uAtlas, vUV).r;
        if (mask < 0.04) discard;
        float glow = mask * 0.9 + pow(mask, 2.5) * 0.5;
        gl_FragColor = vec4(vColor.rgb * 1.9, glow * vColor.a * vAlpha * 0.88);
      }
    `;

    function compile(type: number, src: string) {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS))
        console.error(gl!.getShaderInfoLog(s));
      return s;
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(prog);

    const qVBO = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, qVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, -0.5,
    ]), gl.STATIC_DRAW);

    // pos(2)+vel(2)+size(1)+phase(1)+symbol(1)+rotSpeed(1)+color(4) = 12
    const STRIDE = 12, MAX = 500;
    const iData = new Float32Array(MAX * STRIDE);
    const iVBO  = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, iVBO);
    gl.bufferData(gl.ARRAY_BUFFER, iData.byteLength, gl.STREAM_DRAW);

    const aQ   = gl.getAttribLocation(prog, "aQuadPos");
    const aPo  = gl.getAttribLocation(prog, "aPos");
    const aV   = gl.getAttribLocation(prog, "aVel");
    const aSz  = gl.getAttribLocation(prog, "aSize");
    const aPh  = gl.getAttribLocation(prog, "aPhase");
    const aSy  = gl.getAttribLocation(prog, "aSymbol");
    const aRS  = gl.getAttribLocation(prog, "aRotSpeed");
    const aCol = gl.getAttribLocation(prog, "aColor");
    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTm  = gl.getUniformLocation(prog, "uTime");

    gl.uniform1i(gl.getUniformLocation(prog, "uAtlas"), 0);
    gl.uniform1f(gl.getUniformLocation(prog, "uCols"),  COLS);
    gl.uniform1f(gl.getUniformLocation(prog, "uRows"),  ROWS);

    function domainColor(i: number): [number,number,number,number] {
      if (i < 32)  return [0.784, 1.0,   0.0,   0.9 ]; // lime
      if (i < 55)  return [0.0,   0.898, 1.0,   0.9 ]; // cyan
      if (i < 70)  return [0.6,   0.8,   1.0,   0.85]; // blue
      if (i < 100) return [0.482, 0.361, 1.0,   0.9 ]; // purple
      if (i < 120) return [0.7,   0.2,   1.0,   0.85]; // violet
      if (i < 140) return [0.2,   0.85,  0.65,  0.85]; // teal
      if (i < 165) return [1.0,   0.75,  0.0,   0.85]; // amber
      if (i < 185) return [1.0,   0.85,  0.2,   0.85]; // gold
      if (i < 200) return [1.0,   0.4,   0.8,   0.85]; // pink
      if (i < 215) return [0.3,   0.5,   1.0,   0.85]; // deep blue
      if (i < 225) return [1.0,   0.95,  0.8,   0.9 ]; // warm white
      if (i < 240) return [1.0,   0.2,   0.6,   0.85]; // magenta
      return              [1.0,   1.0,   1.0,   1.0 ]; // white
    }

    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    type P = {
      px: number; py: number; vx: number; vy: number;
      sz: number; ph: number; sy: number; rs: number;
      cr: number; cg: number; cb: number; ca: number;
    };

    function spawn(W: number, H: number): P {
      const sy = Math.floor(Math.random() * SYMBOLS.length);
      const [cr, cg, cb, ca] = domainColor(sy);
      const type = Math.floor(Math.random() * 3);
      let vx = 0, vy = 0;
      if (type === 0) { vx = rand(-10, 10); vy = rand(-7, 7);  }
      else if (type === 1) { vx = rand(-2, 2);  vy = rand(7, 20);  }
      else                 { vx = rand(9, 25);  vy = rand(-3, 3);  }
      return {
        px: rand(0, W), py: rand(0, H),
        vx, vy,
        sz: rand(20, 55),
        ph: rand(0, Math.PI * 2),
        sy, rs: rand(-0.35, 0.35),
        cr, cg, cb, ca,
      };
    }

    const W0 = canvas.width || 800;
    const H0 = canvas.height || 600;
    const parts: P[] = Array.from({ length: MAX }, () => spawn(W0, H0));

    const BS = STRIDE * 4;
    const bind = () => {
      gl!.bindBuffer(gl!.ARRAY_BUFFER, iVBO);
      ([ [aPo,2,0],[aV,2,2],[aSz,1,4],[aPh,1,5],
         [aSy,1,6],[aRS,1,7],[aCol,4,8],
      ] as [number,number,number][]).forEach(([loc, sz, off]) => {
        gl!.enableVertexAttribArray(loc);
        gl!.vertexAttribPointer(loc, sz, gl!.FLOAT, false, BS, off * 4);
        ext!.vertexAttribDivisorANGLE(loc, 1);
      });
    };

    let startT = performance.now() / 1000;
    let id: number;

    function draw() {
      const now = performance.now() / 1000;
      const t   = now - startT;
      const W   = canvas!.width;
      const H   = canvas!.height;

      gl!.clearColor(0.031, 0.031, 0.059, 1.0);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      gl!.useProgram(prog);
      gl!.uniform1f(uTm, t);
      gl!.uniform2f(uRes, W, H);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, tex);

      for (let i = 0; i < MAX; i++) {
        const p = parts[i];
        const b = i * STRIDE;
        iData[b+0]=p.px;  iData[b+1]=p.py;
        iData[b+2]=p.vx;  iData[b+3]=p.vy;
        iData[b+4]=p.sz;  iData[b+5]=p.ph;
        iData[b+6]=p.sy;  iData[b+7]=p.rs;
        iData[b+8]=p.cr;  iData[b+9]=p.cg;
        iData[b+10]=p.cb; iData[b+11]=p.ca;
      }

      if (t > 45) {
        startT = now;
        parts.forEach(p => Object.assign(p, spawn(W, H)));
      }

      gl!.bindBuffer(gl!.ARRAY_BUFFER, qVBO);
      gl!.enableVertexAttribArray(aQ);
      gl!.vertexAttribPointer(aQ, 2, gl!.FLOAT, false, 0, 0);
      ext!.vertexAttribDivisorANGLE(aQ, 0);

      gl!.bindBuffer(gl!.ARRAY_BUFFER, iVBO);
      gl!.bufferSubData(gl!.ARRAY_BUFFER, 0, iData);
      bind();

      ext!.drawArraysInstancedANGLE(gl!.TRIANGLE_STRIP, 0, 4, MAX);
      id = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}