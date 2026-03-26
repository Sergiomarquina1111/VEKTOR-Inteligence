"use client";
import { useEffect, useRef } from "react";

export default function WebGLCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl");
    if (!gl) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    // Vertex shader
    const vsSource = `
      attribute vec2 a_position;
      attribute float a_size;
      attribute float a_alpha;
      uniform vec2 u_resolution;
      varying float v_alpha;
      void main() {
        vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
        gl_Position = vec4(clip * vec2(1, -1), 0, 1);
        gl_PointSize = a_size;
        v_alpha = a_alpha;
      }
    `;

    // Fragment shader
    const fsSource = `
      precision mediump float;
      varying float v_alpha;
      uniform vec3 u_color;
      void main() {
        float d = distance(gl_PointCoord, vec2(0.5));
        if (d > 0.5) discard;
        float soft = 1.0 - smoothstep(0.3, 0.5, d);
        gl_FragColor = vec4(u_color, v_alpha * soft);
      }
    `;

    function compileShader(type: number, src: string) {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      return s;
    }

    const program = gl.createProgram()!;
    gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vsSource));
    gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fsSource));
    gl.linkProgram(program);
    gl.useProgram(program);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Particle system
    const COUNT = 180;
    const positions = new Float32Array(COUNT * 2);
    const velocities = new Float32Array(COUNT * 2);
    const sizes = new Float32Array(COUNT);
    const alphas = new Float32Array(COUNT);
    const alphaSpeed = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i++) {
      positions[i * 2] = Math.random() * canvas.width;
      positions[i * 2 + 1] = Math.random() * canvas.height;
      velocities[i * 2] = (Math.random() - 0.5) * 0.4;
      velocities[i * 2 + 1] = (Math.random() - 0.5) * 0.4;
      sizes[i] = Math.random() * 3 + 1;
      alphas[i] = Math.random();
      alphaSpeed[i] = (Math.random() * 0.005 + 0.002) * (Math.random() > 0.5 ? 1 : -1);
    }

    const posBuf = gl.createBuffer()!;
    const sizeBuf = gl.createBuffer()!;
    const alphaBuf = gl.createBuffer()!;

    const aPos = gl.getAttribLocation(program, "a_position");
    const aSize = gl.getAttribLocation(program, "a_size");
    const aAlpha = gl.getAttribLocation(program, "a_alpha");
    const uRes = gl.getUniformLocation(program, "u_resolution");
    const uColor = gl.getUniformLocation(program, "u_color");

    // Connection lines between nearby particles
    const lineVsSource = `
      attribute vec2 a_position;
      uniform vec2 u_resolution;
      void main() {
        vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
        gl_Position = vec4(clip * vec2(1, -1), 0, 1);
      }
    `;
    const lineFsSource = `
      precision mediump float;
      uniform float u_alpha;
      uniform vec3 u_color;
      void main() {
        gl_FragColor = vec4(u_color, u_alpha);
      }
    `;

    const lineProgram = gl.createProgram()!;
    gl.attachShader(lineProgram, compileShader(gl.VERTEX_SHADER, lineVsSource));
    gl.attachShader(lineProgram, compileShader(gl.FRAGMENT_SHADER, lineFsSource));
    gl.linkProgram(lineProgram);

    const lineBuf = gl.createBuffer()!;
    const lAPos = gl.getAttribLocation(lineProgram, "a_position");
    const lURes = gl.getUniformLocation(lineProgram, "u_resolution");
    const lUAlpha = gl.getUniformLocation(lineProgram, "u_alpha");
    const lUColor = gl.getUniformLocation(lineProgram, "u_color");

    let animId: number;

    function draw() {
      const w = canvas!.width;
      const h = canvas!.height;

      // Update particles
      for (let i = 0; i < COUNT; i++) {
        positions[i * 2] += velocities[i * 2];
        positions[i * 2 + 1] += velocities[i * 2 + 1];
        alphas[i] += alphaSpeed[i];

        if (alphas[i] > 0.8 || alphas[i] < 0.05) alphaSpeed[i] *= -1;
        if (positions[i * 2] < 0 || positions[i * 2] > w) velocities[i * 2] *= -1;
        if (positions[i * 2 + 1] < 0 || positions[i * 2 + 1] > h) velocities[i * 2 + 1] *= -1;
      }

      gl!.clearColor(0.031, 0.031, 0.059, 1.0); // #08080F
      gl!.clear(gl!.COLOR_BUFFER_BIT);

      // Draw connection lines
      const DIST = 120;
      const lineVerts: number[] = [];
      const lineAlphas: number[] = [];

      for (let i = 0; i < COUNT; i++) {
        for (let j = i + 1; j < COUNT; j++) {
          const dx = positions[i * 2] - positions[j * 2];
          const dy = positions[i * 2 + 1] - positions[j * 2 + 1];
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < DIST) {
            lineVerts.push(
              positions[i * 2], positions[i * 2 + 1],
              positions[j * 2], positions[j * 2 + 1]
            );
            lineAlphas.push(1 - dist / DIST);
          }
        }
      }

      if (lineVerts.length > 0) {
        gl!.useProgram(lineProgram);
        gl!.uniform2f(lURes, w, h);
        gl!.uniform3f(lUColor, 0.482, 0.361, 1.0); // #7B5CFF purple
        gl!.uniform1f(lUAlpha, 0.15);
        gl!.bindBuffer(gl!.ARRAY_BUFFER, lineBuf);
        gl!.bufferData(gl!.ARRAY_BUFFER, new Float32Array(lineVerts), gl!.DYNAMIC_DRAW);
        gl!.enableVertexAttribArray(lAPos);
        gl!.vertexAttribPointer(lAPos, 2, gl!.FLOAT, false, 0, 0);
        gl!.drawArrays(gl!.LINES, 0, lineVerts.length / 2);
      }

      // Draw particles
      gl!.useProgram(program);
      gl!.uniform2f(uRes, w, h);

      // Lime particles
      gl!.uniform3f(uColor, 0.784, 1.0, 0.0); // #C8FF00
      gl!.bindBuffer(gl!.ARRAY_BUFFER, posBuf);
      gl!.bufferData(gl!.ARRAY_BUFFER, positions, gl!.DYNAMIC_DRAW);
      gl!.enableVertexAttribArray(aPos);
      gl!.vertexAttribPointer(aPos, 2, gl!.FLOAT, false, 0, 0);

      gl!.bindBuffer(gl!.ARRAY_BUFFER, sizeBuf);
      gl!.bufferData(gl!.ARRAY_BUFFER, sizes, gl!.DYNAMIC_DRAW);
      gl!.enableVertexAttribArray(aSize);
      gl!.vertexAttribPointer(aSize, 1, gl!.FLOAT, false, 0, 0);

      gl!.bindBuffer(gl!.ARRAY_BUFFER, alphaBuf);
      gl!.bufferData(gl!.ARRAY_BUFFER, alphas, gl!.DYNAMIC_DRAW);
      gl!.enableVertexAttribArray(aAlpha);
      gl!.vertexAttribPointer(aAlpha, 1, gl!.FLOAT, false, 0, 0);

      gl!.drawArrays(gl!.POINTS, 0, COUNT);

      animId = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
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