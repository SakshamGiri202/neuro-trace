import pandas as pd
import igraph as ig
from typing import List, Dict, Any
from datetime import timedelta


def score_accounts(
    g: ig.Graph,
    df: pd.DataFrame,
    cycles: List[List[str]],
    smurfing_results: List[Dict[str, Any]],
    shell_results: List[List[str]],
    false_positive_filter: set,
) -> List[Dict[str, Any]]:
    """Calculate suspicion scores for all accounts based on detected patterns using iGraph."""
    # Pre-summarize cycle membership for faster lookup
    cycle_map = {}  # account -> set of lengths
    cycle_accounts = set()
    for cycle in cycles:
        cycle_accounts.update(cycle)
        length = len(cycle)
        for account in cycle:
            if account not in cycle_map:
                cycle_map[account] = set()
            cycle_map[account].add(length)

    smurfing_accounts = {result["account_id"] for result in smurfing_results}
    shell_accounts = set(node for chain in shell_results for node in chain)

    all_suspicious = (
        cycle_accounts | smurfing_accounts | shell_accounts
    ) - false_positive_filter

    avg_amount = df["amount"].mean() if not df.empty else 0
    scored_accounts: List[Dict[str, Any]] = []

    node_names = set(g.vs["name"])

    for account in all_suspicious:
        if account not in node_names:
            continue

        score = 0.0
        patterns: List[str] = []

        # --- 1. Pattern Matching & Base Scores ---
        if account in cycle_map:
            # Cycles are the strongest indicator of organized fraud
            for length in sorted(cycle_map[account]):
                patterns.append(f"cycle_length_{length}")
            score += 60  # Increased from 50

        smurf_match = next(
            (r for r in smurfing_results if r["account_id"] == account), None
        )
        if smurf_match:
            patterns.extend(smurf_match["patterns"])
            score += 40  # Increased from 30

        if account in shell_accounts:
            patterns.append("shell_chain")
            score += 30  # Increased from 25

        # --- 2. Temporal & Behavioral Modifiers ---
        if smurf_match and smurf_match.get("is_temporal", False):
            patterns.append("high_velocity")
            score += 20

        # Efficient tx filtering for velocity
        account_txs = df[(df["sender_id"] == account) | (df["receiver_id"] == account)]
        if not account_txs.empty:
            timestamps = pd.to_datetime(account_txs["timestamp"])
            if len(timestamps) >= 3:  # 3+ txs for velocity
                t_diff = timestamps.max() - timestamps.min()
                if t_diff <= timedelta(hours=24):  # Tighter window (24h)
                    if "high_velocity" not in patterns:
                        patterns.append("high_velocity")
                        score += 20

            max_amount = account_txs["amount"].max()
            if avg_amount > 0 and max_amount > avg_amount * 10:  # True outliers
                patterns.append("high_value_outlier")
                score += 15

        # --- 3. Composite Boost ---
        # If multiple major patterns overlap, boost the score significantly
        major_patterns = {"cycle", "smurfing", "shell", "high_velocity"}
        actual_major = [p for p in patterns if any(m in p for m in major_patterns)]
        if len(set(actual_major)) >= 2:
            score *= 1.25  # 25% boost for multi-pattern accounts

        final_score = round(min(score, 100.0), 1)

        # --- 4. Precision Filter ---
        # Accounts with very low scores are noise and decrease precision
        if final_score < 30.0:
            continue

        scored_accounts.append(
            {
                "account_id": account,
                "suspicion_score": final_score,
                "detected_patterns": list(set(patterns)),
                "ring_id": "",
            }
        )

    return sorted(scored_accounts, key=lambda x: x["suspicion_score"], reverse=True)
