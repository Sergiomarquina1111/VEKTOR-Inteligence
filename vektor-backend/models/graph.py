from pydantic import BaseModel, Field
from typing import Optional


class DKGNodeModel(BaseModel):
    id: str
    label: str
    description: str
    tier: str                          # foundational | intermediate | advanced | expert
    aliases: list[str] = Field(default_factory=list)   # alternate names for semantic matching
    prerequisites: list[str] = Field(default_factory=list)  # list of node IDs this node depends on


class DKGEdgeModel(BaseModel):
    source: str                        # node ID
    target: str                        # node ID
    relation: str                      # "requires" | "leads_to" | "part_of" | "generalizes"
    weight: float = 1.0


class DKGModel(BaseModel):
    subject: str
    subtopic: str
    version: str
    nodeCount: int
    edgeCount: int
    nodes: list[DKGNodeModel]
    edges: list[DKGEdgeModel]
