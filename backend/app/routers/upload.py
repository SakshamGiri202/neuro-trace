"""
Upload router for RingBreaker API.
"""

import time
from io import StringIO
from concurrent.futures import ThreadPoolExecutor

import pandas as pd
from fastapi import APIRouter, UploadFile, File, HTTPException

from app.models.schemas import (
    AnalysisResponse,
    SuspiciousAccount,
    FraudRing,
    AnalysisSummary,
    HashReportRequest,
    HashReportResponse,
)
from app.utils.csv_validator import validate_csv
from app.utils.hasher import hash_report, get_timestamp
from app.services.graph_builder import build_graph
from app.services.cycle_detector import find_cycles, get_cycle_accounts
from app.services.smurfing import detect_smurfing
from app.services.shell_detector import detect_shells, get_shell_accounts
from app.services.false_positive import filter_false_positives
from app.services.scorer import score_accounts
from app.services.ring_grouper import group_rings


router = APIRouter(prefix="/api", tags=["upload"])
import gc
from typing import Optional

class AnalysisState:
    """Manages the memory for analysis results."""
    def __init__(self):
        self.result: Optional[AnalysisResponse] = None
        self.df: Optional[pd.DataFrame] = None

    def update(self, result: AnalysisResponse, df: pd.DataFrame):
        # Clear previous references before setting new ones
        self.result = None
        self.df = None
        gc.collect() # Force cleanup of the previous large objects
        
        self.result = result
        self.df = df

state = AnalysisState()


@router.post("/upload")
async def upload_csv(file: UploadFile = File(...)) -> AnalysisResponse:
    """Upload and analyze a CSV file for fraud detection."""

    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed")

    start_time = time.time()

    try:
        contents = await file.read()
        print(f"DEBUG: Processing file: {file.filename}, size: {len(contents)}")
        csv_text = contents.decode("utf-8")
        df = pd.read_csv(StringIO(csv_text))
    except Exception as e:
        print(f"DEBUG: Parse error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")

    validation_result = validate_csv(df)
    print(f"DEBUG: Validation result: {validation_result}")
    if not validation_result["valid"]:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "CSV validation failed",
                "errors": validation_result["errors"],
            },
        )

    G = build_graph(df)
    
    # Run detection algorithms in parallel to improve performance
    with ThreadPoolExecutor() as executor:
        future_cycles = executor.submit(find_cycles, G)
        future_smurfing = executor.submit(detect_smurfing, G, df)
        future_shells = executor.submit(detect_shells, G, df)
        
        cycles = future_cycles.result()
        smurfing_results = future_smurfing.result()
        shell_results = future_shells.result()

    cycle_accounts = get_cycle_accounts(cycles)
    smurfing_accounts = {result["account_id"] for result in smurfing_results}
    shell_accounts = get_shell_accounts(shell_results)
    suspicious_set = cycle_accounts | smurfing_accounts | shell_accounts
    false_positive_filter = filter_false_positives(suspicious_set, G, df)
    scored_accounts = score_accounts(
        G, df, cycles, smurfing_results, shell_results, false_positive_filter
    )
    fraud_rings, updated_scored_accounts = group_rings(
        cycles, smurfing_results, shell_results, scored_accounts
    )

    # Convert scored accounts to a map for all_accounts
    suspicious_map = {acc["account_id"]: acc for acc in updated_scored_accounts}
    
    all_accounts = {}
    for node in G.nodes():
        if node in suspicious_map:
            acc = suspicious_map[node]
            all_accounts[node] = {
                "account_id": node,
                "suspicion_score": acc["suspicion_score"],
                "detected_patterns": acc["detected_patterns"],
                "ring_id": acc["ring_id"],
                "total_transactions": G.in_degree(node) + G.out_degree(node)
            }
        else:
            all_accounts[node] = {
                "account_id": node,
                "suspicion_score": 0.0,
                "detected_patterns": [],
                "ring_id": None,
                "total_transactions": G.in_degree(node) + G.out_degree(node)
            }

    # Prepare edges
    edges_list = []
    suspicious_ids = {acc["account_id"] for acc in updated_scored_accounts if acc["suspicion_score"] > 30}
    for u, v, data in G.edges(data=True):
        edges_list.append({
            "from_account": u,
            "to_account": v,
            "amount": float(data["amount"]),
            "suspicious": u in suspicious_ids or v in suspicious_ids
        })

    # Communities
    try:
        import networkx.community as nx_comm
        comm_sets = nx_comm.louvain_communities(G)
        communities = {}
        for i, comm_set in enumerate(comm_sets):
            for node in comm_set:
                communities[node] = i
    except:
        communities = {node: 0 for node in G.nodes()}

    # Adjacency
    adj = {node: list(G.successors(node)) for node in G.nodes()}
    reverse_adj = {node: list(G.predecessors(node)) for node in G.nodes()}
    
    # Degrees
    node_degrees = {node: G.in_degree(node) + G.out_degree(node) for node in G.nodes()}

    suspicious_accounts_list = [
        SuspiciousAccount(
            account_id=acc["account_id"],
            suspicion_score=acc["suspicion_score"],
            detected_patterns=acc["detected_patterns"],
            ring_id=acc["ring_id"],
        )
        for acc in updated_scored_accounts
    ]
    fraud_rings_list = [
        FraudRing(
            ring_id=ring["ring_id"],
            member_accounts=ring["member_accounts"],
            pattern_type=ring["pattern_type"],
            risk_score=ring["risk_score"],
        )
        for ring in fraud_rings
    ]
    processing_time = time.time() - start_time

    response = AnalysisResponse(
        suspicious_accounts=suspicious_accounts_list,
        fraud_rings=fraud_rings_list,
        summary=AnalysisSummary(
            total_accounts_analyzed=validation_result["account_count"],
            suspicious_accounts_flagged=len(suspicious_accounts_list),
            fraud_rings_detected=len(fraud_rings_list),
            processing_time_seconds=round(processing_time, 2),
        ),
        all_accounts=all_accounts,
        edges=edges_list,
        communities=communities,
        node_degrees=node_degrees,
        adj=adj,
        reverse_adj=reverse_adj
    )
    state.update(response, df)
    return response


@router.post("/hash-report", response_model=HashReportResponse)
async def hash_report_endpoint(request: HashReportRequest) -> HashReportResponse:
    """Hash a report dictionary for audit purposes."""
    return HashReportResponse(
        sha256_hash=hash_report(request.report), timestamp=get_timestamp()
    )


@router.get("/graph/cytoscape")
async def get_cytoscape_graph():
    """Get graph data in Cytoscape.js format for visualization."""
    if state.result is None or state.df is None:
        raise HTTPException(status_code=404, detail="No analysis has been run yet")

    from app.services.graph_builder import build_graph

    G = build_graph(state.df)

    suspicious_account_ids = {
        acc.account_id for acc in state.result.suspicious_accounts
    }
    ring_map = {
        acc.account_id: acc.ring_id for acc in state.result.suspicious_accounts
    }
    score_map = {
        acc.account_id: acc.suspicion_score
        for acc in state.result.suspicious_accounts
    }

    nodes = []
    for node in G.nodes():
        in_deg = G.in_degree(node)
        out_deg = G.out_degree(node)

        total_sent = sum(G[u][v]["amount"] for u, v in G.out_edges(node))
        total_received = sum(G[u][v]["amount"] for u, v in G.in_edges(node))

        is_suspicious = node in suspicious_account_ids

        if is_suspicious:
            node_type = "suspicious"
            ring_id = ring_map.get(node, "")
            score = score_map.get(node, 0)
        else:
            node_type = "normal"
            ring_id = ""
            score = 0

        nodes.append(
            {
                "data": {
                    "id": node,
                    "label": node,
                    "type": node_type,
                    "ring_id": ring_id,
                    "score": score,
                    "in_degree": in_deg,
                    "out_degree": out_deg,
                    "total_sent": total_sent,
                    "total_received": total_received,
                }
            }
        )

    edges = []
    for u, v in G.edges():
        edge_data = G[u][v]
        edges.append(
            {
                "data": {
                    "id": f"{u}-{v}",
                    "source": u,
                    "target": v,
                    "amount": edge_data["amount"],
                    "transaction_id": edge_data["transaction_id"],
                }
            }
        )

    return {"nodes": nodes, "edges": edges}
