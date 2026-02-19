"""
Cycle detection service for RingBreaker.
"""

import networkx as nx
from typing import List, Set


def find_cycles(G: nx.DiGraph, max_length: int = 5) -> List[List[str]]:
    """Detect cycles in the transaction graph."""
    valid_lengths = {3, 4, 5}
    all_cycles = list(nx.simple_cycles(G))
    return [cycle for cycle in all_cycles if len(cycle) in valid_lengths]


def get_cycle_accounts(cycles: List[List[str]]) -> Set[str]:
    """Get all unique account IDs that appear in any detected cycle."""
    account_set: Set[str] = set()
    for cycle in cycles:
        account_set.update(cycle)
    return account_set
