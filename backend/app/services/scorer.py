"""
Scoring service for RingBreaker.
"""

import pandas as pd
import networkx as nx
from typing import List, Dict, Any
from datetime import timedelta


def score_accounts(
    G: nx.DiGraph,
    df: pd.DataFrame,
    cycles: List[List[str]],
    smurfing_results: List[Dict[str, Any]],
    shell_results: List[List[str]],
    false_positive_filter: set,
) -> List[Dict[str, Any]]:
    """Calculate suspicion scores for all accounts based on detected patterns."""
    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"])

    cycle_accounts = set()
    for cycle in cycles:
        cycle_accounts.update(cycle)

    smurfing_accounts = {result["account_id"] for result in smurfing_results}
    shell_accounts = set(chain for chain in shell_results for chain in chain)

    all_suspicious = (
        cycle_accounts | smurfing_accounts | shell_accounts
    ) - false_positive_filter

    avg_amount = df["amount"].mean() if not df.empty else 0
    scored_accounts: List[Dict[str, Any]] = []

    for account in all_suspicious:
        if account not in G:
            continue

        score = 0.0
        patterns: List[str] = []

        if account in cycle_accounts:
            for cycle in cycles:
                if account in cycle:
                    length = len(cycle)
                    patterns.append(f"cycle_length_{length}")
                    score += 50
                    break

        smurf_match = next(
            (r for r in smurfing_results if r["account_id"] == account), None
        )
        if smurf_match:
            patterns.extend(smurf_match["patterns"])
            score += 30

        if account in shell_accounts:
            patterns.append("shell_chain")
            score += 25

        if smurf_match and smurf_match.get("is_temporal", False):
            patterns.append("high_velocity")
            score += 15

        account_txs = df[(df["sender_id"] == account) | (df["receiver_id"] == account)]
        if not account_txs.empty:
            timestamps = account_txs["timestamp"].sort_values()
            if len(timestamps) >= 2 and (
                timestamps.max() - timestamps.min()
            ) <= timedelta(hours=72):
                if "high_velocity" not in patterns:
                    patterns.append("high_velocity")
                    score += 15

        max_amount = account_txs["amount"].max() if not account_txs.empty else 0
        if avg_amount > 0 and max_amount > avg_amount * 5:
            patterns.append("high_value_outlier")
            score += 10

        scored_accounts.append(
            {
                "account_id": account,
                "suspicion_score": round(min(score, 100.0), 1),
                "detected_patterns": list(set(patterns)),
                "ring_id": "",
            }
        )

    return sorted(scored_accounts, key=lambda x: x["suspicion_score"], reverse=True)
