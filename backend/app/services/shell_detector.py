import igraph as ig
from typing import List, Set, Any

def detect_shells(g: ig.Graph, df: Any = None) -> List[List[str]]:
    """Detect shell accounts and shell chains in the transaction graph using iGraph."""
    shell_candidates = []
    node_names = g.vs["name"]

    for i in range(g.vcount()):
        in_deg = g.indegree(i)
        out_deg = g.outdegree(i)
        total_tx = in_deg + out_deg
        
        if (
            2 <= total_tx <= 4
            and in_deg > 0
            and out_deg > 0
        ):
            shell_candidates.append(i)

    shell_set = set(shell_candidates)
    chains: List[List[str]] = []
    visited = set()

    def find_chains_from_node(curr_idx: int, current_chain: List[int]) -> None:
        if len(current_chain) >= 3:
            chains.append([node_names[idx] for idx in current_chain])
            
        if len(current_chain) >= 5:
            return
            
        for successor in g.successors(curr_idx):
            if successor in shell_set and successor not in current_chain:
                find_chains_from_node(successor, current_chain + [successor])

    for node_idx in shell_candidates:
        if node_idx not in visited:
            find_chains_from_node(node_idx, [node_idx])
            visited.add(node_idx)

    return chains

def get_shell_accounts(shell_results: List[List[str]]) -> Set[str]:
    """Get all unique account IDs that appear in any shell chain."""
    account_set: Set[str] = set()
    for chain in shell_results:
        account_set.update(chain)
    return account_set
