"use client";
import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/authstore";

const ACCENT        = "#2BD9A0";
const ACCENT_DIM    = "#2BD9A015";
const ACCENT_BORDER = "#2BD9A035";

const WEEKS = ["W1","W2","W3","W4","W5","W6","W7","W8","W9","W10","W11","W12"];

// REPLACE: query(collection(db,"sessions"), where("dkgVersion","in", user.publishedDKGs))
// aggregate per-week T1/T2/T3 counts per concept node
const CONCEPT_DATA: Record<string, { t1:number[]; t2:number[]; t3:number[]; current:number }> = {
  "Eigenvalues":     { t1:[5,8,12,10,15,20,22,24,26,27,28,29], t2:[20,22,25,20,30,35,33,30,28,27,25,22], t3:[40,42,48,50,38,28,24,20,17,15,12,10], current:29 },
  "Linear Indep.":   { t1:[10,15,22,28,35,40,45,48,52,56,58,61], t2:[30,32,30,28,25,22,20,18,15,12,12,11], t3:[35,32,28,22,18,15,12,10,8,6,5,4], current:61 },
  "Determinants":    { t1:[15,20,30,38,45,50,55,58,60,62,64,65], t2:[25,28,28,25,22,20,18,16,14,12,11,11], t3:[20,18,15,12,10,8,6,5,4,3,2,2], current:65 },
  "SVD":             { t1:[2,3,4,5,7,9,11,13,14,16,17,18], t2:[8,10,12,15,18,20,22,22,20,18,16,14], t3:[5,8,10,12,14,16,14,12,11,10,9,8], current:18 },
  "Orthogonality":   { t1:[8,10,14,18,22,28,30,32,33,34,35,36], t2:[25,26,25,24,22,20,18,16,14,12,11,10], t3:[38,40,38,35,30,24,20,17,14,12,10,8], current:36 },
  "Null Space":      { t1:[12,15,20,25,30,35,38,40,42,44,45,46], t2:[28,30,28,26,22,20,18,16,14,12,12,11], t3:[25,22,20,18,15,12,10,8,7,6,5,5], current:46 },
};

function LineChart({ data, concept }: { data: typeof CONCEPT_DATA[string]; concept: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = canvas.parentElement!.clientWidth;
    const h = 200;
    canvas.style.width = w + "px"; canvas.style.height = h + "px";
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const pad = { top: 16, right: 16, bottom: 28, left: 36 };
    const cw  = w - pad.left - pad.right;
    const ch  = h - pad.top  - pad.bottom;
    const n   = WEEKS.length;
    const maxY = 60;

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + ch * (1 - i / 4);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke();
      ctx.fillStyle = "#3A3A5C";
      ctx.font = `400 8px 'DM Mono',monospace`;
      ctx.textAlign = "right";
      ctx.fillText((maxY * i / 4) + "%", pad.left - 4, y + 3);
    }
    WEEKS.forEach((wk, i) => {
      ctx.fillStyle = "#3A3A5C";
      ctx.font = `400 8px 'DM Mono',monospace`;
      ctx.textAlign = "center";
      ctx.fillText(wk, pad.left + (i / (n - 1)) * cw, h - 6);
    });

    function drawLine(vals: number[], color: string, fill: boolean) {
      const pts = vals.map((v, i) => ({
        x: pad.left + (i / (n - 1)) * cw,
        y: pad.top + ch * (1 - Math.min(v, maxY) / maxY),
      }));
      if (fill) {
        ctx.fillStyle = color + "18";
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pad.top + ch);
        pts.forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.lineTo(pts[pts.length - 1].x, pad.top + ch);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath();
      pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();
      ctx.fillStyle = color;
      pts.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); });
    }

    drawLine(data.t3, "#FF3D57", false);
    drawLine(data.t2, "#FFB800", false);
    drawLine(data.t1, "#2BD9A0", true);
  }, [data]);

  return <canvas ref={ref} style={{ display: "block" }} />;
}

export default function ResearcherTrendsPage() {
  const [selected, setSelected] = useState("Eigenvalues");
  const data = CONCEPT_DATA[selected];

  const growthT1   = data.t1[data.t1.length - 1] - data.t1[0];
  const peakT3Week = data.t3.indexOf(Math.max(...data.t3)) + 1;
  const peakT3Val  = Math.max(...data.t3);

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-6 h-px" style={{ backgroundColor: ACCENT }} />
          <span className="text-xs tracking-widest uppercase"
            style={{ color: ACCENT, fontFamily: "var(--font-dm-mono)" }}>Trends</span>
        </div>
        <h1 className="text-2xl font-black" style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>
          Knowledge Evolution
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Concept selector */}
        <div style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}>
          <div className="px-4 py-3 border-b text-xs tracking-widest uppercase"
            style={{ borderColor:"#1E1E36", color:"#3A3A5C", fontFamily:"var(--font-dm-mono)" }}>
            Concept Node
          </div>
          {Object.entries(CONCEPT_DATA).map(([name, d]) => (
            <button key={name}
              onClick={() => setSelected(name)}
              className="w-full flex items-center justify-between px-4 py-3 text-left text-sm transition-colors"
              style={{
                backgroundColor: selected === name ? ACCENT_DIM : "transparent",
                borderLeft: selected === name ? `2px solid ${ACCENT}` : "2px solid transparent",
                color: selected === name ? ACCENT : "#6B6A80",
                fontFamily: "var(--font-dm-mono)",
                borderBottom: "1px solid #1E1E3620",
              }}
            >
              {name}
              <span style={{ color: selected === name ? ACCENT : "#3A3A5C", fontSize: 10 }}>
                {d.current}%
              </span>
            </button>
          ))}
        </div>

        <div className="lg:col-span-3 space-y-4">
          {/* Chart */}
          <div style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}>
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "#1E1E36" }}>
              <div>
                <div className="font-black text-sm" style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>
                  {selected}
                </div>
                <div className="text-xs mt-0.5" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>
                  T1 alignment % per week · 12-week cohort
                </div>
              </div>
              <span className="text-sm font-black" style={{ color: ACCENT, fontFamily: "var(--font-syne)" }}>
                Current {data.current}%
              </span>
            </div>
            <div className="p-4">
              <LineChart data={data} concept={selected} />
            </div>
            <div className="flex gap-6 px-4 pb-4">
              {[
                { label:"T1 Aligned", color:"#2BD9A0" },
                { label:"T2 Gap",     color:"#FFB800" },
                { label:"T3 Misconception", color:"#FF3D57" },
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-2">
                  <div className="w-4 h-0.5" style={{ backgroundColor: l.color }} />
                  <span className="text-xs" style={{ color: "#6B6A80", fontFamily: "var(--font-dm-mono)" }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label:"12-Week T1 Growth", val:`+${growthT1}%`, color:ACCENT, sub:"from W1 to W12" },
              { label:"Peak T3 Week",       val:`W${peakT3Week}`, color:"#FF3D57", sub:`${peakT3Val}% misconception rate` },
              { label:"T1 This Week",       val:`${data.current}%`, color:"#C8FF00", sub:"current alignment" },
            ].map((s) => (
              <div key={s.label} className="p-4"
                style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}>
                <div className="text-xs tracking-widest uppercase mb-2"
                  style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>{s.label}</div>
                <div className="text-2xl font-black mb-1"
                  style={{ fontFamily: "var(--font-syne)", color: s.color }}>{s.val}</div>
                <div className="text-xs" style={{ color: "#6B6A80" }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}