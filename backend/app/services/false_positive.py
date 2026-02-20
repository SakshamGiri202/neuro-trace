import pandas as pd
import igraph as ig
from typing import Set, List

def filter_false_positives(
    suspicious: Set[str], g: ig.Graph, df: pd.DataFrame
) -> Set[str]:
    """
    Filter out false positive suspicious accounts using iGraph and Pandas.
    """
    false_positives: Set[str] = set()
    node_names = g.vs["name"]
    name_to_idx = {name: i for i, name in enumerate(node_names)}
    suspicious_list = list(suspicious)
    
    # Pre-calculate stats for ONLY suspicious accounts to save memory
    sent_df = df[df["sender_id"].isin(suspicious_list)]
    sent_groups = sent_df.groupby("sender_id")["amount"].agg(["count", "mean", "std"])
    
    recv_df = df[df["receiver_id"].isin(suspicious_list)]
    recv_patterns = recv_df.groupby(["receiver_id", "sender_id", "amount"]).size().reset_index(name="count")

    for account in suspicious:
        if account not in name_to_idx:
            continue
            
        idx = name_to_idx[account]
        in_deg = g.indegree(idx)
        out_deg = g.outdegree(idx)
        total_tx = in_deg + out_deg

        # --- 1. Institutional Merchant Protection ---
        # High in-volume from many unique senders, low out-volume relative to in-volume
        if in_deg > 20:
            unique_senders = df[df["receiver_id"] == account]["sender_id"].nunique()
            if unique_senders > 15 and out_deg < (in_deg * 0.2):
                false_positives.add(account)
                continue

        # --- 2. Payroll Distribution Protection ---
        # High out-volume to many accounts with consistent amounts
        if out_deg > 20 and in_deg < 5:
            if account in sent_groups.index:
                stats = sent_groups.loc[account]
                # High count, low variance in amounts
                if stats["count"] > 10 and (stats["std"] / (stats["mean"] + 0.1)) < 0.05:
                    false_positives.add(account)
                    continue

        # --- 3. Batch Payment / Bill Pay ---
        if account in sent_groups.index:
            stats = sent_groups.loc[account]
            if stats["count"] > 50 and in_deg > 30: # High volume mixed node
                 false_positives.add(account)
                 continue

        # 4. Static incoming pattern (One-to-One repeated)
        pats = recv_patterns[recv_patterns["receiver_id"] == account]
        if not pats.empty:
            max_p_count = pats["count"].max()
            if max_p_count > 5:
                if len(pats) < 3: # Constant funding from 1-2 sources
                    false_positives.add(account)
                    continue

        # 5. Isolated Pair check (Only drop true 1-to-1 isolated pairs)
        if total_tx == 1:
            false_positives.add(account)

    return false_positives
