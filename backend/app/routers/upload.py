"""
Upload router for RingBreaker API.
"""

import logging
import time
from io import StringIO
from typing import Any, Dict, List

import pandas as pd
from fastapi import APIRouter, UploadFile, File, HTTPException, status
from networkx import DiGraph

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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["upload"])
last_analysis_result: AnalysisResponse | None = None
last_dataframe: pd.DataFrame | None = None


@router.post("/upload")
async def upload_csv(file: UploadFile = File(...)) -> AnalysisResponse:
    """
    Upload and analyze a CSV file for fraud detection.
    
    Args:
        file: The CSV file to upload and analyze
        
    Returns:
        AnalysisResponse: Analysis results with suspicious accounts and fraud rings
        
    Raises:
        HTTPException: If file validation or processing fails
    """
    global last_analysis_result, last_dataframe

    # ERROR CHECK: Validate filename is not None before calling endswith()
    if not file.filename or not file.filename.endswith(".csv"):
        logger.warning(f"Invalid file type attempted: {file.filename}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV files are allowed"
        )

    start_time = time.time()

    try:
        contents = await file.read()
        # ERROR CHECK: Specific exception handling for encoding errors
        try:
            csv_text = contents.decode("utf-8")
        except UnicodeDecodeError as e:
            logger.error(f"UTF-8 decode error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must be UTF-8 encoded"
            ) from e
            
        # ERROR CHECK: Specific exception handling for CSV parsing errors
        try:
            df = pd.read_csv(StringIO(csv_text))
        except pd.errors.ParserError as e:
            logger.error(f"CSV parsing error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid CSV format: {str(e)}"
            ) from e
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error reading file: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to read file"
        ) from e

    # ERROR CHECK: Validate CSV structure and content
    validation_result = validate_csv(df)
    if not validation_result.get("valid", False):
        logger.warning(f"CSV validation failed: {validation_result.get('errors')}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "CSV validation failed",
                "errors": validation_result.get("errors", []),
            },
        )

    try:
        # Build graph from dataframe
        G: DiGraph = build_graph(df)
        
        # Detect fraud patterns
        cycles = find_cycles(G)
        cycle_accounts = get_cycle_accounts(cycles)
        
        smurfing_results = detect_smurfing(G, df)
        # ERROR CHECK: Safe set comprehension with key validation
        smurfing_accounts = {
            result.get("account_id") for result in smurfing_results 
            if "account_id" in result
        }
        
        shell_results = detect_shells(G, df)
        shell_accounts = get_shell_accounts(shell_results)
        
        # Combine all suspicious accounts
        suspicious_set = cycle_accounts | smurfing_accounts | shell_accounts
        
        # Filter false positives
        false_positive_filter = filter_false_positives(suspicious_set, G, df)
        
        # Score accounts
        scored_accounts = score_accounts(
            G, df, cycles, smurfing_results, shell_results, false_positive_filter
        )
        
        # Group into fraud rings
        fraud_rings, updated_scored_accounts = group_rings(
            cycles, smurfing_results, shell_results, scored_accounts
        )

        # ERROR CHECK: Safe dictionary access when building response objects
        suspicious_accounts_list: List[SuspiciousAccount] = [
            SuspiciousAccount(
                account_id=acc.get("account_id"),
                suspicion_score=acc.get("suspicion_score", 0),
                detected_patterns=acc.get("detected_patterns", []),
                ring_id=acc.get("ring_id"),
            )
            for acc in updated_scored_accounts
            if "account_id" in acc  # Only include if account_id exists
        ]
        
        fraud_rings_list: List[FraudRing] = [
            FraudRing(
                ring_id=ring.get("ring_id"),
                member_accounts=ring.get("member_accounts", []),
                pattern_type=ring.get("pattern_type"),
                risk_score=ring.get("risk_score", 0),
            )
            for ring in fraud_rings
            if "ring_id" in ring  # Only include if ring_id exists
        ]
        
        processing_time = time.time() - start_time

        response = AnalysisResponse(
            suspicious_accounts=suspicious_accounts_list,
            fraud_rings=fraud_rings_list,
            summary=AnalysisSummary(
                total_accounts_analyzed=validation_result.get("account_count", 0),
                suspicious_accounts_flagged=len(suspicious_accounts_list),
                fraud_rings_detected=len(fraud_rings_list),
                processing_time_seconds=round(processing_time, 2),
            ),
        )
        
        last_analysis_result = response
        last_dataframe = df
        
        logger.info(f"Analysis completed: {len(suspicious_accounts_list)} suspicious accounts, {len(fraud_rings_list)} fraud rings")
        return response
        
    except Exception as e:
        logger.error(f"Error during analysis processing: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error processing analysis"
        ) from e


@router.post("/hash-report", response_model=HashReportResponse)
async def hash_report_endpoint(request: HashReportRequest) -> HashReportResponse:
    """
    Hash a report dictionary for audit purposes.
    
    Args:
        request: The report request containing data to hash
        
    Returns:
        HashReportResponse: SHA256 hash and timestamp
    """
    try:
        return HashReportResponse(
            sha256_hash=hash_report(request.report), 
            timestamp=get_timestamp()
        )
    except Exception as e:
        logger.error(f"Error hashing report: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to hash report"
        ) from e


@router.get("/graph/cytoscape")
async def get_cytoscape_graph() -> Dict[str, List[Dict[str, Any]]]:
    """
    Get graph data in Cytoscape.js format for visualization.
    
    Returns:
        Dict containing nodes and edges for Cytoscape.js
        
    Raises:
        HTTPException: If no analysis has been run yet
    """
    global last_analysis_result, last_dataframe

    # ERROR CHECK: Validate that analysis has been run
    if last_analysis_result is None or last_dataframe is None:
        logger.warning("Cytoscape graph requested but no analysis has been run")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No analysis has been run yet"
        )

    try:
        from app.services.graph_builder import build_graph

        G: DiGraph = build_graph(last_dataframe)

        # Build lookup maps for faster access
        suspicious_account_ids: set = {
            acc.account_id for acc in last_analysis_result.suspicious_accounts
        }
        ring_map: Dict[str, str] = {
            acc.account_id: acc.ring_id for acc in last_analysis_result.suspicious_accounts
        }
        score_map: Dict[str, float] = {
            acc.account_id: acc.suspicion_score
            for acc in last_analysis_result.suspicious_accounts
        }

        nodes: List[Dict[str, Any]] = []
        
        for node in G.nodes():
            in_deg = G.in_degree(node)
            out_deg = G.out_degree(node)

            # ERROR CHECK: Safe sum with default value for empty edges
            total_sent = sum(
                (G[u][v].get("amount", 0) for u, v in G.out_edges(node)), 
                start=0
            )
            total_received = sum(
                (G[u][v].get("amount", 0) for u, v in G.in_edges(node)), 
                start=0
            )

            is_suspicious = node in suspicious_account_ids

            # Simplified conditional logic
            node_type = "suspicious" if is_suspicious else "normal"
            ring_id = ring_map.get(node, "") if is_suspicious else ""
            score = score_map.get(node, 0) if is_suspicious else 0

            nodes.append({
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
            })

        edges: List[Dict[str, Any]] = []
        
        for u, v in G.edges():
            edge_data = G[u][v]
            # ERROR CHECK: Safe dictionary access with defaults for edge data
            edges.append({
                "data": {
                    "id": f"{u}-{v}",
                    "source": u,
                    "target": v,
                    "amount": edge_data.get("amount", 0),
                    "transaction_id": edge_data.get("transaction_id", ""),
                }
            })

        logger.info(f"Generated cytoscape graph: {len(nodes)} nodes, {len(edges)} edges")
        return {"nodes": nodes, "edges": edges}
        
    except Exception as e:
        logger.error(f"Error generating cytoscape graph: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate graph data"
        ) from e
