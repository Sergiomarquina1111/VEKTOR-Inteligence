"use client";
import { useState } from "react";
import { useAuthStore } from "@/store/authstore";

const ACCENT        = "#2BD9A0";
const ACCENT_DIM    = "#2BD9A015";
const ACCENT_BORDER = "#2BD9A035";

type ExportFormat = "json" | "csv" | "graphml";

interface ExportConfig {
  subject:    string;
  dateRange:  string;
  cohort:     string;
  anonymize:  boolean;
  format:     ExportFormat;
  includeNodes: boolean;
  includeEdges: boolean;
  includeTiers: boolean;
  includeHistory: boolean;
}

const FORMATS: { id: ExportFormat; label: string; icon: string; desc: string; tags: string[] }[] = [
  {
    id: "json",
    label: "JSON",
    icon: "{ }",
    desc: "Full graph structure — nodes, edges, tier distributions, prereq chains, and session aggregates. Best for programmatic analysis.",
    tags: ["nodes","edges","weights","tiers","sessions"],
  },
  {
    id: "csv",
    label: "CSV",
    icon: "⊞",
    desc: "Node coverage per student per session in tabular format. Compatible with Excel, R, and Python pandas for statistical analysis.",
    tags: ["per-student","per-session","tier-history","Excel-ready"],
  },
  {
    id: "graphml",
    label: "GraphML",
    icon: "⬡",
    desc: "Open standard XML format for direct import into Gephi or Cytoscape. All node attributes and edge properties preserved.",
    tags: ["Gephi","Cytoscape","NetworkX","open-standard"],
  },
];

export default function ResearcherExportPage() {
  const { user } = useAuthStore();
  const [config, setConfig] = useState<ExportConfig>({
    subject:        "Mathematics",
    dateRange:      "last_30",
    cohort:         "all",
    anonymize:      true,
    format:         "json",
    includeNodes:   true,
    includeEdges:   true,
    includeTiers:   true,
    includeHistory: false,
  });
  const [exporting, setExporting] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(null);

  function set<K extends keyof ExportConfig>(k: K, v: ExportConfig[K]) {
    setConfig((prev) => ({ ...prev, [k]: v }));
  }

  async function handleExport() {
    setExporting(true);
    // REPLACE: POST /api/research/export with config → receive download URL
    await new Promise((r) => setTimeout(r, 1400));
    setLastExport(new Date().toISOString());
    setExporting(false);
    alert(`Exporting as ${config.format.toUpperCase()}...\n\nIn production this calls /api/research/export and returns a signed download URL from Railway + Cloud Storage.`);
  }

  const selectedFormat = FORMATS.find((f) => f.id === config.format)!;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-6 h-px" style={{ backgroundColor: ACCENT }} />
          <span className="text-xs tracking-widest uppercase"
            style={{ color: ACCENT, fontFamily: "var(--font-dm-mono)" }}>Export</span>
        </div>
        <h1 className="text-2xl font-black" style={{ fontFamily: "var(--font-syne)", color: "#F0F0FF" }}>
          Graph Export
        </h1>
      </div>

      {/* ── Export config ── */}
      <div className="p-6 space-y-6" style={{ backgroundColor: "#0F0F1A", border: "1px solid #1E1E36" }}>
        <div className="text-xs tracking-widest uppercase"
          style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>Export Configuration</div>

        <div className="grid grid-cols-2 gap-5">
          {[
            { label:"Subject",    key:"subject" as const,    opts:["Mathematics","Physics","Chemistry","Biology","Computer Science"] },
            { label:"Date Range", key:"dateRange" as const,  opts:[["last_7","Last 7 days"],["last_30","Last 30 days"],["last_90","Last 90 days"],["all","All time"]] },
            { label:"Cohort",     key:"cohort" as const,     opts:[["all","All students"],["jee","JEE Aspirants"],["ug","Undergraduates"]] },
          ].map((field) => (
            <div key={field.key}>
              <div className="text-xs tracking-widest uppercase mb-2"
                style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>{field.label}</div>
              <select
                value={config[field.key] as string}
                onChange={(e) => set(field.key, e.target.value as any)}
                className="w-full text-sm px-3 py-2 outline-none"
                style={{ backgroundColor: "#08080F", border: "1px solid #1E1E36",
                  color: "#F0F0FF", fontFamily: "var(--font-dm-mono)" }}
              >
                {field.opts.map((o) =>
                  typeof o === "string"
                    ? <option key={o} value={o}>{o}</option>
                    : <option key={o[0]} value={o[0]}>{o[1]}</option>
                )}
              </select>
            </div>
          ))}

          <div>
            <div className="text-xs tracking-widest uppercase mb-2"
              style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>Anonymize Data</div>
            <div className="flex gap-2">
              {[true, false].map((v) => (
                <button key={String(v)}
                  onClick={() => set("anonymize", v)}
                  className="flex-1 py-2 text-xs tracking-widest uppercase transition-all"
                  style={{
                    backgroundColor: config.anonymize === v ? ACCENT_DIM : "transparent",
                    border: config.anonymize === v ? `1px solid ${ACCENT_BORDER}` : "1px solid #1E1E36",
                    color: config.anonymize === v ? ACCENT : "#6B6A80",
                    fontFamily: "var(--font-dm-mono)",
                  }}
                >{v ? "Yes (GDPR)" : "No (internal)"}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Include toggles */}
        <div>
          <div className="text-xs tracking-widest uppercase mb-3"
            style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>Include in Export</div>
          <div className="flex gap-3 flex-wrap">
            {([
              ["includeNodes",   "Concept Nodes"],
              ["includeEdges",   "Edge Weights"],
              ["includeTiers",   "Tier Distribution"],
              ["includeHistory", "Session History"],
            ] as const).map(([k, label]) => (
              <button key={k}
                onClick={() => set(k, !config[k])}
                className="px-3 py-1.5 text-xs transition-all"
                style={{
                  backgroundColor: config[k] ? ACCENT_DIM : "transparent",
                  border: config[k] ? `1px solid ${ACCENT_BORDER}` : "1px solid #1E1E36",
                  color: config[k] ? ACCENT : "#6B6A80",
                  fontFamily: "var(--font-dm-mono)",
                }}
              >
                {config[k] ? "✓ " : ""}{label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Format selector ── */}
      <div>
        <div className="text-xs tracking-widest uppercase mb-3"
          style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>Export Format</div>
        <div className="grid grid-cols-3 gap-4">
          {FORMATS.map((f) => (
            <div
              key={f.id}
              className="p-5 cursor-pointer transition-all"
              onClick={() => set("format", f.id)}
              style={{
                backgroundColor: config.format === f.id ? "#0F0F1A" : "#0F0F1A",
                border: config.format === f.id ? `1px solid ${ACCENT_BORDER}` : "1px solid #1E1E36",
              }}
            >
              <div className="text-2xl mb-2" style={{ color: ACCENT }}>{f.icon}</div>
              <div className="font-black text-sm mb-2"
                style={{ fontFamily: "var(--font-syne)", color: config.format === f.id ? ACCENT : "#F0F0FF" }}>
                {f.label}
              </div>
              <p className="text-xs mb-3 leading-relaxed" style={{ color: "#6B6A80" }}>{f.desc}</p>
              <div className="flex flex-wrap gap-1">
                {f.tags.map((t) => (
                  <span key={t} className="text-xs px-1.5 py-0.5"
                    style={{ backgroundColor: "#1E1E36", color: "#6B6A80", fontFamily: "var(--font-dm-mono)", fontSize: 9 }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Export button ── */}
      <div className="flex items-center justify-between pt-2">
        {lastExport && (
          <span className="text-xs" style={{ color: "#3A3A5C", fontFamily: "var(--font-dm-mono)" }}>
            Last export: {new Date(lastExport).toLocaleTimeString()}
          </span>
        )}
        <button
          onClick={handleExport}
          disabled={exporting}
          className="ml-auto px-6 py-3 text-sm font-black tracking-widest transition-all"
          style={{
            backgroundColor: ACCENT, color: "#08080F", fontFamily: "var(--font-syne)",
            opacity: exporting ? 0.6 : 1,
          }}
          onMouseEnter={(e) => !exporting && (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={(e) => !exporting && (e.currentTarget.style.opacity = "1")}
        >
          {exporting ? "EXPORTING..." : `↗ EXPORT ${selectedFormat.label}`}
        </button>
      </div>
    </div>
  );
}