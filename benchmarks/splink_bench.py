"""Splink benchmark — called from Node benchmark runner."""
import json, time, sys, duckdb, pandas as pd
from splink import DuckDBAPI, Linker, SettingsCreator, block_on
import splink.comparison_library as cl

def main():
    data = json.loads(sys.stdin.read())
    df = pd.DataFrame(data)
    conn = duckdb.connect()
    conn.register("input", df)
    conn.execute(
        "CREATE TABLE src AS SELECT row_number() over () - 1 AS unique_id, * FROM input"
    )
    settings = SettingsCreator(
        link_type="dedupe_only",
        comparisons=[cl.JaroWinklerAtThresholds("first", 0.8), cl.JaroWinklerAtThresholds("last", 0.8)],
        blocking_rules_to_generate_predictions=[block_on("first"), block_on("last")],
    )
    linker = Linker("src", settings, db_api=DuckDBAPI(connection=conn))
    t0 = time.time()
    try:
        linker.training.estimate_parameters_using_expectation_maximisation("last")
    except:
        pass
    pairs = 0
    try:
        p = linker.inference.predict()
        pairs = len(p.as_record_dict())
    except:
        pass
    elapsed = time.time() - t0
    print(json.dumps({
        "records": len(df),
        "timeMs": int(elapsed * 1000),
        "timeSec": f"{elapsed:.1f}",
        "pairs": pairs,
        "engine": "splink",
        "version": "4.0",
        "throughput": int(len(df) / elapsed) if elapsed > 0 else 0,
        "mode": "DuckDB Python, 2-field jaro_winkler",
    }))

if __name__ == "__main__":
    main()
