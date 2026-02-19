"""
Pydantic schemas for RingBreaker API.
"""

from typing import List
from pydantic import BaseModel


class SuspiciousAccount(BaseModel):
    account_id: str
    suspicion_score: float
    detected_patterns: List[str]
    ring_id: str | None


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


class Edge(BaseModel):
    from_account: str
    to_account: str
    amount: float
    suspicious: bool


class AnalysisResponse(BaseModel):
    suspicious_accounts: List[SuspiciousAccount]
    fraud_rings: List[FraudRing]
    summary: AnalysisSummary
    all_accounts: dict  # Map<account_id, AccountAnalysis>
    edges: List[Edge]
    communities: dict   # Map<account_id, community_id>
    node_degrees: dict  # Map<account_id, degree>
    adj: dict           # Map<account_id, List<neighbor_id>>
    reverse_adj: dict   # Map<account_id, List<neighbor_id>>


class HashReportRequest(BaseModel):
    report: dict


class HashReportResponse(BaseModel):
    sha256_hash: str
    timestamp: str
