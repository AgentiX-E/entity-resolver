"""
Splink 4 comparison benchmark for standard ER datasets.
Uses default m/u parameters when EM training is unavailable.
"""
import json, os, time
import pandas as pd
from splink import DuckDBAPI, Linker, SettingsCreator, block_on
from splink import comparison_library as cl

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output')
os.makedirs(OUT, exist_ok=True)

def run_splink_linkage(name, left_df, right_df, comparisons, blocking_rules, mapping_path):
    print(f"  {name}: {len(left_df)}+{len(right_df)}... ", end='', flush=True)

    mapping = pd.read_csv(mapping_path)
    true_pairs = set()
    for _, row in mapping.iterrows():
        true_pairs.add((str(row.iloc[0]).strip(), str(row.iloc[1]).strip()))

    # Add unique_id
    left_df = left_df.copy()
    right_df = right_df.copy()
    left_df["unique_id"] = [str(i) for i in range(len(left_df))]
    right_df["unique_id"] = [str(i + len(left_df)) for i in range(len(right_df))]

    settings = SettingsCreator(
        link_type="link_only",
        comparisons=comparisons,
        blocking_rules_to_generate_predictions=blocking_rules,
        probability_two_random_records_match=0.001,
    )

    linker = Linker(
        input_table_or_tables=[left_df, right_df],
        settings=settings,
        db_api=DuckDBAPI(),
        input_table_aliases=["__l", "__r"],
    )

    # Train EM with same blocking rule
    linker.training.estimate_parameters_using_expectation_maximisation(blocking_rules[0])

    start = time.time()
    predictions = linker.inference.predict(threshold_match_probability=0.5)
    elapsed = time.time() - start

    # Handle both list and dict return types
    rows = predictions.as_record_dict()
    if isinstance(rows, list):
        pred_pairs = set()
        for row in rows:
            lid = str(row.get('unique_id_l', ''))
            rid = str(row.get('unique_id_r', ''))
            if lid and rid:
                # Map back to original ids
                l_idx = int(lid) if lid.isdigit() else -1
                r_idx = int(rid) if rid.isdigit() else -1
                orig_l = str(left_df.iloc[l_idx].get('id', lid)) if 0 <= l_idx < len(left_df) else lid
                orig_r = str(right_df.iloc[r_idx - len(left_df)].get('id', rid)) if len(left_df) <= r_idx < len(left_df)+len(right_df) else rid
                pred_pairs.add((orig_l.strip(), orig_r.strip()))
    else:
        pred_pairs = set()
        for key, row in rows.items():
            lid = str(row.get('unique_id_l', ''))
            rid = str(row.get('unique_id_r', ''))
            if lid and rid:
                l_idx = int(lid) if lid.isdigit() else -1
                r_idx = int(rid) if rid.isdigit() else -1
                orig_l = str(left_df.iloc[l_idx].get('id', lid)) if 0 <= l_idx < len(left_df) else lid
                orig_r = str(right_df.iloc[r_idx - len(left_df)].get('id', rid)) if len(left_df) <= r_idx < len(left_df)+len(right_df) else rid
                pred_pairs.add((orig_l.strip(), orig_r.strip()))

    tp = len(pred_pairs & true_pairs)
    precision = tp / len(pred_pairs) if pred_pairs else 0
    recall = tp / len(true_pairs) if true_pairs else 0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0

    print(f"F1={f1:.4f} P={precision:.4f} R={recall:.4f} ({len(pred_pairs)} pairs)")
    return {
        "dataset": name, "records": len(left_df)+len(right_df),
        "trueMatches": len(true_pairs), "precision": round(precision,4),
        "recall": round(recall,4), "f1": round(f1,4),
        "timeSec": round(elapsed,1), "pairs": len(pred_pairs), "tool": "splink",
    }

if __name__ == '__main__':
    results = []

    print("=== DBLP-ACM ===")
    dblp = pd.read_csv("benchmarks/datasets/DBLP-ACM/DBLP2.csv", encoding="latin1", dtype=str).fillna("")
    acm = pd.read_csv("benchmarks/datasets/DBLP-ACM/ACM.csv", encoding="latin1", dtype=str).fillna("")
    r = run_splink_linkage("DBLP-ACM", dblp, acm,
        [cl.JaroWinklerAtThresholds("title", [0.8]), cl.ExactMatch("year")],
        [block_on("title")], "benchmarks/datasets/DBLP-ACM/DBLP-ACM_perfectMapping.csv")
    if r: results.append(r)

    print("=== Abt-Buy ===")
    abt = pd.read_csv("benchmarks/datasets/Abt-Buy/Abt.csv", encoding="latin1", dtype=str).fillna("")
    buy = pd.read_csv("benchmarks/datasets/Abt-Buy/Buy.csv", encoding="latin1", dtype=str).fillna("")
    r = run_splink_linkage("Abt-Buy", abt, buy,
        [cl.JaroWinklerAtThresholds("name", [0.8])],
        [block_on("name")], "benchmarks/datasets/Abt-Buy/abt_buy_perfectMapping.csv")
    if r: results.append(r)

    print("=== Amazon-Google ===")
    amazon = pd.read_csv("benchmarks/datasets/Amazon-Google/Amazon.csv", encoding="latin1", dtype=str).fillna("")
    google = pd.read_csv("benchmarks/datasets/Amazon-Google/GoogleProducts.csv", encoding="latin1", dtype=str).fillna("")
    google = google.rename(columns={"name": "title"})
    r = run_splink_linkage("Amazon-Google", amazon, google,
        [cl.JaroWinklerAtThresholds("title", [0.8]), cl.ExactMatch("manufacturer")],
        [block_on("title")], "benchmarks/datasets/Amazon-Google/Amzon_GoogleProducts_perfectMapping.csv")
    if r: results.append(r)

    out_path = os.path.join(OUT, 'splink-results.json')
    with open(out_path, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\nSaved {len(results)} results")
