from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


# ─── Enums ────────────────────────────────────────────────────────────────────

class KnowledgeTier(str, Enum):
    T1 = "T1"  # Aligned
    T2 = "T2"  # Gap / Incomplete
    T3 = "T3"  # Misconception
    T4 = "T4"  # Fragmented / Unknown


class TierLabel(str, Enum):
    T1 = "Aligned"
    T2 = "Incomplete"
    T3 = "Misconception"
    T4 = "Fragmented"


# ─── Inbound ──────────────────────────────────────────────────────────────────

class SessionAnalyzeRequest(BaseModel):
    query: str = Field(..., min_length=3, max_length=2000, description="Student's STEM question or explanation")
    subject: Optional[str] = Field(None, description="Override subject detection. One of: mathematics, physics, chemistry, biology, computer_science")
    userId: str = Field(..., description="Firebase Auth UID")
    classId: Optional[str] = Field(None, description="Class ID if student is enrolled")
    dkgVersion: Optional[str] = Field(None, description="Pin to a specific DKG version. Uses latest if omitted.")


# ─── Knowledge Graph ──────────────────────────────────────────────────────────

class GraphNode(BaseModel):
    id: str
    label: str
    tier: Optional[str] = None          # DKG tier: foundational / intermediate / advanced / expert
    matched_dkg_id: Optional[str] = None
    similarity_score: Optional[float] = None


class DKGNode(BaseModel):
    """A node from the Domain Knowledge Graph — sent to frontend for visualisation."""
    id: str
    label: str
    tier: str                            # foundational / intermediate / advanced / expert
    description: str
    prerequisites: list[str] = []        # list of node IDs
    is_matched: bool = False             # true if any SKG node matched this DKG node
    match_status: str = "unvisited"      # aligned | gap | misconception | unvisited


class GraphEdge(BaseModel):
    source: str
    target: str
    relation: str
    contradicts_dkg: bool = False


class KnowledgeGraph(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class DKGGraph(BaseModel):
    nodes: list[DKGNode]
    edges: list[GraphEdge]


# ─── Analysis Results ─────────────────────────────────────────────────────────

class GapItem(BaseModel):
    concept: str
    dkg_node_id: str
    description: str
    priority: str  # high | medium | low


class MisconceptionItem(BaseModel):
    concept: str
    student_belief: str
    correct_understanding: str
    dkg_node_id: str


class AdaptivePathItem(BaseModel):
    concept: str
    reason: str
    priority: str  # high | medium | low
    blocked_by: Optional[str] = None


class GraphMetrics(BaseModel):
    node_coverage: float
    edge_alignment: float
    contradiction_rate: float
    prereq_chain_coverage: float
    concept_depth: float
    missing_critical_nodes: list[str]
    weighted_alignment: float


# ─── Simulation ───────────────────────────────────────────────────────────────

class SimulationParams(BaseModel):
    template: str                     # orbital | wave | force | transform | graph_plot | sort | ...
    studentParams: dict               # parameters matching student's described understanding
    correctParams: dict               # parameters matching scientifically correct understanding
    narration: str                    # 1-2 sentences shown during the phase transition
    deltaKeys: list[str]              # which param keys differ between student and correct


class SimulationResponse(BaseModel):
    simulatable: bool
    simulationHint: Optional[str] = None   # orbital | wave | force | transform | graph_plot | sort | ...
    simulation: Optional[SimulationParams] = None


# ─── Full Session Response ────────────────────────────────────────────────────

class SessionAnalyzeResponse(BaseModel):
    sessionId: str
    userId: str
    subject: str
    subjectConfidence: float
    tier: KnowledgeTier
    tierLabel: str
    tierScore: float                  # 0.0–1.0 alignment score
    query: str
    skg: KnowledgeGraph               # Student Knowledge Graph
    dkg: DKGGraph                     # Domain Knowledge Graph — relevant nodes only
    metrics: GraphMetrics
    gaps: list[GapItem]
    misconceptions: list[MisconceptionItem]
    explanation: str                  # AI-generated explanation of the gap
    adaptivePath: list[AdaptivePathItem]
    simulation: SimulationResponse
    dkgVersion: str
    dkgNodeCount: int
    processingTimeMs: int


# ─── Health Check ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str                       # ok | degraded | error
    environment: str
    gemini_available: bool
    sentence_transformer_loaded: bool
    dkgs_loaded: list[str]
    version: str = "1.0.0"