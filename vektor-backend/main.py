"""
VEKTOR Intelligence — FastAPI Backend
Entry point: main.py
Start: uvicorn main:app --host 0.0.0.0 --port 8000
"""

import os
import logging
import time
import uuid
from contextlib import asynccontextmanager
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, Depends, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from models.session import (
    SessionAnalyzeRequest,
    SessionAnalyzeResponse,
    HealthResponse,
    KnowledgeTier,
    GraphNode,
    GraphEdge,
    KnowledgeGraph,
    DKGGraph,
    DKGNode,
    SimulationResponse,
    SimulationDelta,
)
from services import (
    extract_triples,
    load_all_dkgs,
    load_sentence_transformer,
    build_skg,
    match_skg_to_dkg,
    get_dkg_for_subject,
    get_loaded_dkg_keys,
    sentence_transformer_loaded,
    get_similarity_scores,
    compare_graphs,
    classify_tier,
    build_gap_list,
    build_misconception_list,
    generate_explanation,
    build_dkg_context,
    gemini_available,
)

from services.simulator import extract_simulation_params, SUBJECT_DEFAULT_HINT as SIM_DEFAULT_HINTS

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)

_session_counts: dict[str, int] = {}
FREE_TIER_DAILY_LIMIT = 5


# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("VEKTOR Intelligence backend starting up...")
    load_sentence_transformer()
    load_all_dkgs()
    logger.info("Startup complete. DKGs loaded: %s", get_loaded_dkg_keys())
    yield
    logger.info("VEKTOR Intelligence backend shutting down.")


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="VEKTOR Intelligence API",
    description="STEM knowledge graph analysis engine.",
    version="1.0.0",
    lifespan=lifespan,
)

allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Auth ──────────────────────────────────────────────────────────────────────

async def verify_firebase_token(request: Request) -> str:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")
    token = auth_header.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty token")

    if os.getenv("ENVIRONMENT", "development") == "development":
        return token

    # ── UNCOMMENT BEFORE PRODUCTION DEPLOY ────────────────────────────────────
    # try:
    #     import firebase_admin.auth as fb_auth
    #     decoded = fb_auth.verify_id_token(token)
    #     return decoded["uid"]
    # except Exception as e:
    #     raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    return token


# ─── Rate limiter ─────────────────────────────────────────────────────────────

def check_rate_limit(uid: str, plan: str = "free"):
    if plan == "pro":
        return
    count = _session_counts.get(uid, 0)
    if count >= FREE_TIER_DAILY_LIMIT:
        raise HTTPException(status_code=429, detail={
            "error": "Daily session limit reached",
            "limit": FREE_TIER_DAILY_LIMIT,
            "message": "Upgrade to VEKTOR Pro for unlimited sessions.",
        })
    _session_counts[uid] = count + 1


# ─── GET /api/health ──────────────────────────────────────────────────────────

@app.get("/api/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok",
        environment=os.getenv("ENVIRONMENT", "development"),
        gemini_available=gemini_available(),
        sentence_transformer_loaded=sentence_transformer_loaded(),
        dkgs_loaded=get_loaded_dkg_keys(),
    )


# ─── POST /api/session/analyze ────────────────────────────────────────────────

@app.post("/api/session/analyze", response_model=SessionAnalyzeResponse)
async def session_analyze(
    body: SessionAnalyzeRequest,
    uid: str = Depends(verify_firebase_token),
):
    start_time = time.time()
    session_id = str(uuid.uuid4())
    logger.info("Session %s started uid=%s query=%.60s...", session_id, uid, body.query)

    check_rate_limit(uid)

    # ── Layer 1: Triple extraction ────────────────────────────────────────────
    extraction         = await extract_triples(body.query, subject_override=body.subject)
    subject            = extraction["subject"]
    triples            = extraction["triples"]
    subject_confidence = extraction["subjectConfidence"]
    simulation_hint    = extraction.get("simulationHint")  # optional hint from extractor
    logger.info("Session %s: subject=%s triples=%d hint=%s",
                session_id, subject, len(triples), simulation_hint)

    # ── Layer 2: Build SKG + DKG + semantic match ─────────────────────────────
    skg_nx = build_skg(triples)

    dkg_result = get_dkg_for_subject(subject)
    if dkg_result is None:
        import networkx as _nx
        dkg_nx  = _nx.DiGraph()
        dkg_raw = {"version": "none", "nodeCount": 0, "edgeCount": 0, "nodes": [], "edges": []}
        logger.warning("Session %s: no DKG for subject '%s'", session_id, subject)
    else:
        dkg_raw, dkg_nx = dkg_result

    skg_to_dkg = match_skg_to_dkg(skg_nx, subject)
    sim_scores  = get_similarity_scores(skg_nx, subject)

    # ── Layer 3: Compare + classify ───────────────────────────────────────────
    metrics        = compare_graphs(skg_nx, dkg_nx, skg_to_dkg)
    tier, tier_score, tier_label = classify_tier(metrics, skg_nx)
    gaps           = build_gap_list(skg_to_dkg, dkg_nx, metrics)
    misconceptions = build_misconception_list(skg_nx, dkg_nx, skg_to_dkg)
    logger.info("Session %s: tier=%s score=%.3f gaps=%d T3=%d",
                session_id, tier, tier_score, len(gaps), len(misconceptions))

    # ── Layer 4: RAG explanation ──────────────────────────────────────────────
    explanation, adaptive_path = await generate_explanation(
        query=body.query,
        tier=tier,
        gaps=gaps,
        misconceptions=misconceptions,
        skg_to_dkg=skg_to_dkg,
        dkg=dkg_nx,
    )

    # ── Layer 5: Simulation parameters ───────────────────────────────────────
    # Runs for every query that produced at least 1 SKG node.
    # No longer gated on triple extractor flags — those were unreliable.
    # The hint is resolved here: use extractor hint if present, else subject default.
    # Non-blocking: if this fails the session still returns with simulatable=False.
    simulation_response = SimulationResponse(simulatable=False)

    resolved_hint = simulation_hint or SIM_DEFAULT_HINTS.get(subject, "generic")

    if len(skg_nx.nodes) >= 1:
        try:
            sim_data = await extract_simulation_params(
                query=body.query,
                subject=subject,
                hint=resolved_hint,
                triples=triples,
                tier=tier,
            )
            if sim_data.get("simulatable"):
                simulation_response = SimulationResponse(
                    simulatable=True,
                    simulationHint=sim_data.get("hint", resolved_hint),
                    label=sim_data.get("label"),
                    studentParams=sim_data.get("studentParams", {}),
                    expertParams=sim_data.get("expertParams", {}),
                    deltas=[
                        SimulationDelta(
                            key=d["key"],
                            label=d["label"],
                            studentValue=d["studentValue"],
                            expertValue=d["expertValue"],
                        )
                        for d in sim_data.get("deltas", [])
                    ],
                )
                logger.info("Session %s: simulation ready hint=%s deltas=%d",
                            session_id, simulation_response.simulationHint,
                            len(simulation_response.deltas))
            else:
                logger.info("Session %s: simulation returned simulatable=False", session_id)
        except Exception as e:
            logger.warning("Session %s: simulation extraction failed: %s", session_id, e)

    # ── Build SKG response ────────────────────────────────────────────────────
    skg_nodes = [
        GraphNode(
            id=n,
            label=n,
            tier=_node_tier(n, skg_to_dkg, dkg_nx),
            matched_dkg_id=skg_to_dkg.get(n),
            similarity_score=sim_scores.get(n),
        )
        for n in skg_nx.nodes
    ]
    skg_edges = [
        GraphEdge(
            source=src,
            target=tgt,
            relation=data.get("relation", "leads_to"),
            contradicts_dkg=_is_contradiction(src, tgt, skg_to_dkg, dkg_nx),
        )
        for src, tgt, data in skg_nx.edges(data=True)
    ]

    # ── Build DKG subgraph ────────────────────────────────────────────────────
    matched_dkg_ids      = {v for v in skg_to_dkg.values() if v is not None}
    missing_critical_ids = {_label_to_id(l, dkg_nx) for l in metrics.missing_critical_nodes}
    misconception_ids    = {m.dkg_node_id for m in misconceptions}
    gap_ids              = {g.dkg_node_id for g in gaps if g.dkg_node_id != "unmatched"}

    expanded_ids = set(matched_dkg_ids) | missing_critical_ids | misconception_ids | gap_ids
    for node_id in list(matched_dkg_ids):
        if node_id in dkg_nx:
            for prereq in dkg_nx.predecessors(node_id):
                expanded_ids.add(prereq)
            for successor in dkg_nx.successors(node_id):
                expanded_ids.add(successor)

    dkg_nodes_response: list[DKGNode] = []
    for node_id in expanded_ids:
        if node_id not in dkg_nx:
            continue
        node_data  = dkg_nx.nodes[node_id]
        is_matched = node_id in matched_dkg_ids

        if node_id in misconception_ids:
            match_status = "misconception"
        elif node_id in gap_ids or node_id in missing_critical_ids:
            match_status = "gap"
        elif is_matched:
            match_status = "aligned"
        else:
            match_status = "unvisited"

        dkg_nodes_response.append(DKGNode(
            id=node_id,
            label=node_data.get("label", node_id),
            tier=node_data.get("tier", "foundational"),
            description=node_data.get("description", ""),
            prerequisites=node_data.get("prerequisites", []),
            is_matched=is_matched,
            match_status=match_status,
        ))

    included_ids = {n.id for n in dkg_nodes_response}
    dkg_edges_response = [
        GraphEdge(source=src, target=tgt, relation=data.get("relation", "leads_to"), contradicts_dkg=False)
        for src, tgt, data in dkg_nx.edges(data=True)
        if src in included_ids and tgt in included_ids
    ]

    elapsed_ms = int((time.time() - start_time) * 1000)
    logger.info("Session %s complete in %dms — SKG:%d DKG:%d",
                session_id, elapsed_ms, len(skg_nodes), len(dkg_nodes_response))

    return SessionAnalyzeResponse(
        sessionId=session_id,
        userId=uid,
        subject=subject,
        subjectConfidence=subject_confidence,
        tier=tier,
        tierLabel=tier_label,
        tierScore=tier_score,
        query=body.query,
        skg=KnowledgeGraph(nodes=skg_nodes, edges=skg_edges),
        dkg=DKGGraph(nodes=dkg_nodes_response, edges=dkg_edges_response),
        metrics=metrics,
        gaps=gaps,
        misconceptions=misconceptions,
        explanation=explanation,
        adaptivePath=adaptive_path,
        simulation=simulation_response,
        dkgVersion=dkg_raw.get("version", "unknown"),
        dkgNodeCount=dkg_raw.get("nodeCount", 0),
        processingTimeMs=elapsed_ms,
    )


# ─── WebSocket /ws/stream ─────────────────────────────────────────────────────

@app.websocket("/ws/stream")
async def ws_stream(websocket: WebSocket):
    await websocket.accept()
    try:
        import asyncio as _asyncio
        data = await websocket.receive_json()
        for word in data.get("explanation", "").split(" "):
            await websocket.send_json({"token": word + " "})
            await _asyncio.sleep(0.016)
        await websocket.send_json({"done": True})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error("ws_stream error: %s", e)
        await websocket.close()


# ─── WebSocket /ws/tutor ──────────────────────────────────────────────────────

@app.websocket("/ws/tutor")
async def ws_tutor(websocket: WebSocket):
    await websocket.accept()
    try:
        import asyncio as _asyncio
        while True:
            data    = await websocket.receive_json()
            message = data.get("message", "")
            response = (
                f"What do you think would happen if you applied that concept differently? "
                f"Can you walk me through your reasoning on: {message[:60]}?"
            )
            for word in response.split(" "):
                await websocket.send_json({"token": word + " "})
                await _asyncio.sleep(0.02)
            await websocket.send_json({"done": True})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error("ws_tutor error: %s", e)
        await websocket.close()


# ─── GET /api/dkg/{subject} ───────────────────────────────────────────────────

@app.get("/api/dkg/{subject}")
async def get_dkg(subject: str, uid: str = Depends(verify_firebase_token)):
    result = get_dkg_for_subject(subject)
    if result is None:
        raise HTTPException(status_code=404, detail=f"No DKG found for subject: {subject}")
    dkg_raw, _ = result
    return dkg_raw


# ─── Global error handler ─────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_error_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception on %s: %s", request.url, exc, exc_info=True)
    return JSONResponse(status_code=500, content={"error": "Internal server error", "detail": str(exc)})


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _node_tier(skg_node: str, skg_to_dkg: dict, dkg_nx) -> Optional[str]:
    dkg_id = skg_to_dkg.get(skg_node)
    if dkg_id and dkg_id in dkg_nx:
        return dkg_nx.nodes[dkg_id].get("tier")
    return None


def _is_contradiction(src: str, tgt: str, skg_to_dkg: dict, dkg_nx) -> bool:
    dkg_src = skg_to_dkg.get(src)
    dkg_tgt = skg_to_dkg.get(tgt)
    if dkg_src and dkg_tgt and dkg_src in dkg_nx and dkg_tgt in dkg_nx:
        return dkg_nx.has_edge(dkg_tgt, dkg_src)
    return False


def _label_to_id(label: str, dkg_nx) -> str:
    for node_id, data in dkg_nx.nodes(data=True):
        if data.get("label", "").lower() == label.lower():
            return node_id
    return label
