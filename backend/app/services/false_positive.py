"""
False positive filtering service for RingBreaker.
"""

import pandas as pd
import networkx as nx
from typing import Set


def filter_false_positives(
    suspicious: Set[str], G: nx.DiGraph, df: pd.DataFrame
) -> Set[str]:
    """Filter out false positive suspicious accounts."""
    df = df.copy()
    false_positives: Set[str] = set()

    for account in suspicious:
        if account not in G:
            continue

        total_tx = G.in_degree(account) + G.out_degree(account)

        if total_tx > 100 and G.in_degree(account) > 50:
            false_positives.add(account)
            continue

        sent_txs = df[df["sender_id"] == account]
        if not sent_txs.empty and len(sent_txs) > 10:
            sent_amounts = sent_txs["amount"].values
            mean_amount = sent_amounts.mean()
            if mean_amount > 0:
                std_dev = sent_amounts.std()
                if std_dev / mean_amount < 0.05:
                    false_positives.add(account)
                    continue

        received_txs = df[df["receiver_id"] == account]
        if not received_txs.empty:
            amount_counts = received_txs.groupby("amount").size()
            if len(amount_counts) == 1 and amount_counts.iloc[0] > 3:
                sender_groups = received_txs.groupby("sender_id").size()
                if len(sender_groups) == 1 and sender_groups.iloc[0] > 3:
                    false_positives.add(account)
                    continue

        has_cycle = any(
            G.has_edge(p, s)
            for p in G.predecessors(account)
            for s in G.successors(account)
        )
        has_shell = any(G.out_degree(s) > 0 for s in G.successors(account))

        if total_tx == 1 and not has_cycle and not has_shell:
            false_positives.add(account)

    return false_positives
