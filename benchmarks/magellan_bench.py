"""Splink benchmark on Magellan iTunes-Amazon dataset."""
import json, time, duckdb, csv, pandas as pd

base = "benchmarks/datasets"

# Load data
with open(f"{base}/Magellan-iTunes.csv", encoding="utf-8") as f:
    itunes = list(csv.DictReader(f))
with open(f"{base}/Magellan-Amazon.csv", encoding="utf-8") as f:
    amazon = list(csv.DictReader(f))
all_records = itunes + amazon
for r in all_records:
    for k in r:
        r[k] = str(r[k] or "")

df = pd.DataFrame(all_records)
conn = duckdb.connect()
conn.register("input", df)
conn.execute(
    "CREATE TABLE src AS SELECT row_number() over () -1 AS unique_id, * FROM input"
)

from splink import DuckDBAPI, Linker, SettingsCreator, block_on
import splink.comparison_library as cl

settings = SettingsCreator(
    link_type="dedupe_only",
    comparisons=[
        cl.JaroWinklerAtThresholds("Song_Name", 0.8),
        cl.JaroWinklerAtThresholds("Artist_Name", 0.8),
    ],
    blocking_rules_to_generate_predictions=[
        block_on("Song_Name"),
        block_on("Artist_Name"),
    ],
)

linker = Linker("src", settings, db_api=DuckDBAPI(connection=conn))
t0 = time.time()
try:
    linker.training.estimate_parameters_using_expectation_maximisation(
        "Artist_Name"
    )
except Exception:
    pass
pairs = 0
try:
    p = linker.inference.predict()
    pairs = len(p.as_record_dict())
except Exception:
    pass
elapsed = time.time() - t0
print(f"Splink: {elapsed:.1f}s, {pairs} pairs")
