from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


# ─── Enums ────────────────────────────────────────────────────────────────────

class KnowledgeTier(str, Enum):
    T1 = "T1"
    T2 = "T2"
    T3 = "T3"
    T4 = "T4"


class TierLabel(str, Enum):
    T1 = "Aligned"
    T2 = "Incomplete"
    T3 = "Misconception"
    T4 = "Fragmented"


# ─── Inbound ──────────────────────────────────────────────────────────────────

class SessionAnalyzeRequest(BaseModel):
    query:      str           = Field(..., min_length=3, max_length=2000)
    subject:    Optional[str] = Field(None)
    userId:     str           = Field(...)
    classId:    Optional[str] = Field(None)
    dkgVersion: Optional[str] = Field(None)


# ─── Knowledge Graph ──────────────────────────────────────────────────────────

class GraphNode(BaseModel):
    id:               str
    label:            str
    tier:             Optional[str]   = None
    matched_dkg_id:   Optional[str]   = None
    similarity_score: Optional[float] = None


class DKGNode(BaseModel):
    id:            str
    label:         str
    tier:          str
    description:   str
    prerequisites: list[str] = []
    is_matched:    bool       = False
    match_status:  str        = "unvisited"


class GraphEdge(BaseModel):
    source:          str
    target:          str
    relation:        str
    contradicts_dkg: bool = False


class KnowledgeGraph(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class DKGGraph(BaseModel):
    nodes: list[DKGNode]
    edges: list[GraphEdge]


# ─── Analysis Results ─────────────────────────────────────────────────────────

class GapItem(BaseModel):
    concept:     str
    dkg_node_id: str
    description: str
    priority:    str


class MisconceptionItem(BaseModel):
    concept:               str
    student_belief:        str
    correct_understanding: str
    dkg_node_id:           str


class AdaptivePathItem(BaseModel):
    concept:    str
    reason:     str
    priority:   str
    blocked_by: Optional[str] = None


class GraphMetrics(BaseModel):
    node_coverage:          float
    edge_alignment:         float
    contradiction_rate:     float
    prereq_chain_coverage:  float
    concept_depth:          float
    missing_critical_nodes: list[str]
    weighted_alignment:     float


# ─── Simulation ───────────────────────────────────────────────────────────────

class SimulationDelta(BaseModel):
    """
    One parameter that differs between student model and expert model.
    UI labels: "YOUR MODEL" / "EXPERT MODEL" — never "wrong" / "correct".
    """
    key:          str
    label:        str
    studentValue: str
    expertValue:  str


class SimulationResponse(BaseModel):
    """
    Populated by simulator.py after session analysis.
    simulatable=False  → hide SIMULATE button.
    simulatable=True   → show SIMULATE button, pass params to WebGL2 engine.

    studentParams: extracted from student's answer  (label: "YOUR MODEL")
    expertParams:  domain-correct parameters        (label: "EXPERT MODEL")
    """
    simulatable:    bool                  = False
    simulationHint: Optional[str]         = None
    label:          Optional[str]         = None
    studentParams:  dict                  = Field(default_factory=dict)
    expertParams:   dict                  = Field(default_factory=dict)
    deltas:         list[SimulationDelta] = Field(default_factory=list)


# ─── Full Session Response ────────────────────────────────────────────────────

class SessionAnalyzeResponse(BaseModel):
    sessionId:         str
    userId:            str
    subject:           str
    subjectConfidence: float
    tier:              KnowledgeTier
    tierLabel:         str
    tierScore:         float
    query:             str
    skg:               KnowledgeGraph
    dkg:               DKGGraph
    metrics:           GraphMetrics
    gaps:              list[GapItem]
    misconceptions:    list[MisconceptionItem]
    explanation:       str
    adaptivePath:      list[AdaptivePathItem]
    simulation:        SimulationResponse
    dkgVersion:        str
    dkgNodeCount:      int
    processingTimeMs:  int


# ─── Health ───────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status:                      str
    environment:                 str
    gemini_available:            bool
    sentence_transformer_loaded: bool
    dkgs_loaded:                 list[str]
    version:                     str = "1.0.0"
