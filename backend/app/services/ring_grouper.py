"""
Ring grouping service for RingBreaker.
"""

from typing import List, Dict, Any, Tuple, Set


def group_rings(
    cycles: List[List[str]],
    smurfing_results: List[Dict[str, Any]],
    shell_results: List[List[str]],
    scored_accounts: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Group suspicious accounts into fraud rings."""
    ring_counter = 1
    fraud_rings: List[Dict[str, Any]] = []
    account_to_ring: Dict[str, str] = {}
    ring_members: Dict[str, Set[str]] = {}
    ring_patterns: Dict[str, Set[str]] = {}

    for cycle in cycles:
        ring_id = f"RING_{ring_counter:03d}"
        ring_counter += 1
        members = set(cycle)
        ring_members[ring_id] = members
        ring_patterns[ring_id] = {"cycle"}
        for account in members:
            account_to_ring[account] = ring_id

    smurfing_accounts = {r["account_id"] for r in smurfing_results}
    unassigned_smurf = smurfing_accounts - set(account_to_ring.keys())

    if unassigned_smurf:
        ring_id = f"RING_{ring_counter:03d}"
        ring_counter += 1
        ring_members[ring_id] = unassigned_smurf
        ring_patterns[ring_id] = {"smurfing"}
        for account in unassigned_smurf:
            account_to_ring[account] = ring_id

    for chain in shell_results:
        chain_set = set(chain)
        overlapping = chain_set & set(account_to_ring.keys())
        if overlapping:
            existing_ring = account_to_ring[list(overlapping)[0]]
            ring_members[existing_ring].update(chain_set)
            ring_patterns[existing_ring].add("shell")
        else:
            ring_id = f"RING_{ring_counter:03d}"
            ring_counter += 1
            ring_members[ring_id] = chain_set
            ring_patterns[ring_id] = {"shell"}
            for account in chain_set:
                account_to_ring[account] = ring_id

    score_map = {acc["account_id"]: acc["suspicion_score"] for acc in scored_accounts}

    for ring_id, members in ring_members.items():
        pattern_types = ring_patterns[ring_id]
        if len(pattern_types) > 1:
            pattern_type = "mixed"
        elif "cycle" in pattern_types:
            pattern_type = "cycle"
        elif "smurfing" in pattern_types:
            pattern_type = "smurfing"
        elif "shell" in pattern_types:
            pattern_type = "shell"
        else:
            pattern_type = "mixed"

        member_list = sorted(list(members))
        member_scores = [score_map.get(acc, 0.0) for acc in member_list]
        risk_score = round(max(member_scores), 1) if member_scores else 0.0

        fraud_rings.append(
            {
                "ring_id": ring_id,
                "member_accounts": member_list,
                "pattern_type": pattern_type,
                "risk_score": risk_score,
            }
        )

    updated_scored_accounts = []
    for account_data in scored_accounts:
        account = account_data["account_id"]
        updated_account = account_data.copy()
        updated_account["ring_id"] = account_to_ring.get(account, "")
        updated_scored_accounts.append(updated_account)

    return fraud_rings, updated_scored_accounts
