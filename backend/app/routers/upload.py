"""
Upload router for RingBreaker API.
"""

import time
from io import StringIO

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
last_analysis_result: AnalysisResponse | None = None


@router.post("/upload")
async def upload_csv(file: UploadFile = File(...)) -> AnalysisResponse:
    """Upload and analyze a CSV file for fraud detection."""
    global last_analysis_result

    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed")

    start_time = time.time()

    try:
        contents = await file.read()
        csv_text = contents.decode("utf-8")
        df = pd.read_csv(StringIO(csv_text))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")

    validation_result = validate_csv(df)
    if not validation_result["valid"]:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "CSV validation failed",
                "errors": validation_result["errors"],
            },
        )

    G = build_graph(df)
    cycles = find_cycles(G)
    cycle_accounts = get_cycle_accounts(cycles)
    smurfing_results = detect_smurfing(G, df)
    smurfing_accounts = {result["account_id"] for result in smurfing_results}
    shell_results = detect_shells(G, df)
    shell_accounts = get_shell_accounts(shell_results)
    suspicious_set = cycle_accounts | smurfing_accounts | shell_accounts
    false_positive_filter = filter_false_positives(suspicious_set, G, df)
    scored_accounts = score_accounts(
        G, df, cycles, smurfing_results, shell_results, false_positive_filter
    )
    fraud_rings, updated_scored_accounts = group_rings(
        cycles, smurfing_results, shell_results, scored_accounts
    )

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
    )
    last_analysis_result = response
    return response


@router.post("/hash-report", response_model=HashReportResponse)
async def hash_report_endpoint(request: HashReportRequest) -> HashReportResponse:
    """Hash a report dictionary for audit purposes."""
    return HashReportResponse(
        sha256_hash=hash_report(request.report), timestamp=get_timestamp()
    )
