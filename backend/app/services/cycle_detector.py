import igraph as ig
from typing import List, Set

def find_cycles(g: ig.Graph, max_length: int = 5) -> List[List[str]]:
    """
    Detect cycles in the transaction graph using a depth-limited DFS with iGraph.
    """
    cycles = []
    num_nodes = g.vcount()
    node_names = g.vs["name"]
    
    # Target specific lengths: 3, 4, 5
    for i in range(num_nodes):
        # stack stores (current_idx, path_as_indices)
        stack = [(i, [i])]
        while stack:
            u, path = stack.pop()
            
            if len(path) > max_length:
                continue
                
            for v in g.successors(u):
                if v == i:
                    if len(path) >= 3:
                        # Found a cycle!
                        # Store as list of names
                        cycles.append([node_names[idx] for idx in path])
                elif v not in path:
                    stack.append((v, path + [v]))
            
            if len(cycles) > 10000: # Slightly higher limit since iGraph is faster
                break
        if len(cycles) > 10000:
            break
            
    # Remove duplicates (different start points of same cycle)
    unique_cycles = []
    seen = set()
    for cycle in cycles:
        canonical = tuple(sorted(cycle))
        if canonical not in seen:
            seen.add(canonical)
            unique_cycles.append(cycle)
            
    return unique_cycles

def get_cycle_accounts(cycles: List[List[str]]) -> Set[str]:
    """Get all unique account IDs that appear in any detected cycle."""
    account_set: Set[str] = set()
    for cycle in cycles:
        account_set.update(cycle)
    return account_set
