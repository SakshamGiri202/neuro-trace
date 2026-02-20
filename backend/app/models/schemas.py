"""
Pydantic schemas for NeuroTrace API request/response models.
"""

from typing import List, Optional
from pydantic import BaseModel


class SuspiciousAccount(BaseModel):
    account_id: str
    suspicion_score: float
    detected_patterns: List[str]
    ring_id: Optional[str] = None


class FraudRing(BaseModel):
    ring_id: str
    member_accounts: List[str]
    pattern_type: str
    risk_score: float


class AnalysisSummary(BaseModel):
    total_accounts_analyzed: int
    suspicious_accounts_flagged: int
    fraud_rings_detected: int
    processing_time_seconds: float


class AnalysisResponse(BaseModel):
    suspicious_accounts: List[SuspiciousAccount]
    fraud_rings: List[FraudRing]
    summary: AnalysisSummary
    all_accounts: Optional[List[SuspiciousAccount]] = None


class HashReportRequest(BaseModel):
    report: dict


class HashReportResponse(BaseModel):
    sha256_hash: str
    timestamp: str
