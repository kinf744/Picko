from __future__ import annotations

import re
from pathlib import Path

ROOT = Path('/home/ubuntu/kighmu-vpn-android/docs/libuz-analysis')
FILES = {
    'libuz': ROOT / 'ghidra-libuz-callgraph.txt',
    'kighmu': ROOT / 'ghidra-kighmu-callgraph.txt',
}


def parse(path: Path):
    text = path.read_text(errors='replace')
    def first(pattern: str):
        m = re.search(pattern, text)
        return int(m.group(1)) if m else None
    edges = re.findall(r'ExportCallGraph\.java>\s+"([0-9a-f]+)" -> "([0-9a-f]+)"', text)
    root = re.search(r'ExportCallGraph\.java> root=([0-9a-f]+)\s+([^\s(]+)', text)
    out = {}
    inc = {}
    for a, b in edges:
        out[a] = out.get(a, 0) + 1
        inc[b] = inc.get(b, 0) + 1
    return {
        'total_functions': first(r'total_functions=(\d+)'),
        'reachable_nodes_depth3': first(r'reachable_nodes_depth3=(\d+)'),
        'reachable_edges_depth3': first(r'reachable_edges_depth3=(\d+)'),
        'root': root.group(1) if root else 'unknown',
        'root_name': root.group(2) if root else 'unknown',
        'edge_count_parsed': len(edges),
        'max_out_degree': max(out.values(), default=0),
        'max_in_degree': max(inc.values(), default=0),
        'root_out_degree': out.get(root.group(1), 0) if root else 0,
        'unique_callers': len(out),
        'unique_callees': len(inc),
    }

rows = {name: parse(path) for name, path in FILES.items()}
out = ['# Comparaison automatique des call graphs Ghidra', '', '| Métrique | libuz | KIGHMU |', '|---|---:|---:|']
keys = ['total_functions', 'reachable_nodes_depth3', 'reachable_edges_depth3', 'edge_count_parsed', 'root_out_degree', 'max_out_degree', 'max_in_degree', 'unique_callers', 'unique_callees']
for key in keys:
    out.append(f"| `{key}` | {rows['libuz'][key]} | {rows['kighmu'][key]} |")
out += ['', '## Racines', '', f"- libuz : `{rows['libuz']['root']}` `{rows['libuz']['root_name']}`", f"- KIGHMU : `{rows['kighmu']['root']}` `{rows['kighmu']['root_name']}`", '', '## Interprétation', '', 'Les adresses ne sont pas comparables directement parce que les deux exécutables sont des builds différents. Les métriques depth-3 comparent uniquement la forme du démarrage reconnu par Ghidra ; elles ne démontrent pas une équivalence de protocole ni une supériorité de performance.']
(ROOT / 'ghidra-callgraph-comparison.md').write_text('\n'.join(out) + '\n')
print('\n'.join(out))
