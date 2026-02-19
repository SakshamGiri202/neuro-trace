"""
False positive filtering service for RingBreaker.
"""

import pandas as pd
import networkx as nx
from typing import Set


def filter_false_positives(
    suspicious: Set[str], G: nx.DiGraph, df: pd.DataFrame
) -> Set[str]:
    """
    Filter out false positive suspicious accounts.
    Memory optimization: Avoid df.copy() and redundant filtering.
    """
    false_positives: Set[str] = set()
    
    # Pre-calculate stats for ONLY suspicious accounts to save memory
    suspicious_list = list(suspicious)
    
    # Sent stats for suspicious accounts
    sent_df = df[df["sender_id"].isin(suspicious_list)]
    sent_groups = sent_df.groupby("sender_id")["amount"].agg(["count", "mean", "std"])
    
    # Received stats for suspicious accounts
    recv_df = df[df["receiver_id"].isin(suspicious_list)]
    # For special pattern: same sender, same amount multiple times
    # We'll just group by (receiver, sender, amount)
    recv_patterns = recv_df.groupby(["receiver_id", "sender_id", "amount"]).size().reset_index(name="count")

    # Group receivers to check for single sender
    recv_stats = recv_df.groupby("receiver_id")
    
    for account in suspicious:
        if account not in G:
            continue

        total_tx = G.in_degree(account) + G.out_degree(account)

        # 1. High-volume institutional false positive
        if total_tx > 100 and G.in_degree(account) > 50:
            false_positives.add(account)
            continue

        # 2. Regular batch payment (constant small variance)
        if account in sent_groups.index:
            stats = sent_groups.loc[account]
            if stats["count"] > 10 and stats["mean"] > 0:
                if (stats["std"] / stats["mean"]) < 0.05:
                    false_positives.add(account)
                    continue

        # 3. Static incoming pattern
        pats = recv_patterns[recv_patterns["receiver_id"] == account]
        if not pats.empty:
            # Check if there is one sender/amount pattern that explains most transactions
            max_p_count = pats["count"].max()
            if max_p_count > 3:
                # If only one primary sender/amount combo
                if len(pats) == 1:
                    false_positives.add(account)
                    continue

        # 4. Isolated node check
        has_cycle = any(
            G.has_edge(p, s)
            for p in G.predecessors(account)
            for s in G.successors(account)
        )
        has_shell = any(G.out_degree(s) > 0 for s in G.successors(account))

        if total_tx == 1 and not has_cycle and not has_shell:
            false_positives.add(account)

    return false_positives
