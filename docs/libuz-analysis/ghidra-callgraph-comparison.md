# Comparaison automatique des call graphs Ghidra

| Métrique | libuz | KIGHMU |
|---|---:|---:|
| `total_functions` | 4603 | 3322 |
| `reachable_nodes_depth3` | 39 | 40 |
| `reachable_edges_depth3` | 42 | 43 |
| `edge_count_parsed` | 42 | 43 |
| `root_out_degree` | 2 | 2 |
| `max_out_degree` | 26 | 27 |
| `max_in_degree` | 4 | 4 |
| `unique_callers` | 6 | 6 |
| `unique_callees` | 38 | 39 |

## Racines

- libuz : `0060dde4` `main.main`
- KIGHMU : `00b1ec18` `main.main`

## Interprétation

Les adresses ne sont pas comparables directement parce que les deux exécutables sont des builds différents. Les métriques depth-3 comparent uniquement la forme du démarrage reconnu par Ghidra ; elles ne démontrent pas une équivalence de protocole ni une supériorité de performance.
