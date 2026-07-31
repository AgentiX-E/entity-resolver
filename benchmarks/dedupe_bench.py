"""dedupe benchmark on synthetic data."""
import json, time, random, os
import dedupe
from dedupe.variables import String

def gen_synthetic(n, seed=42):
    r = seed
    def nf():
        nonlocal r; r = (r * 16807) % 2147483647; return (r - 1) / 2147483646
    chars = 'abcdefghijklmnopqrstuvwxyz'
    total = n + int(n * 0.2)
    recs = {}
    for i in range(n):
        f = ''.join(chars[int(nf()*26)] for _ in range(4 + int(nf() * 5))).capitalize()
        l = ''.join(chars[int(nf()*26)] for _ in range(5 + int(nf() * 6))).capitalize()
        recs[str(i)] = {"first": f, "last": l}
    for i in range(int(n * 0.2)):
        orig = recs[str(i % n)]
        dup_id = str(n + i)
        f = orig["first"][:3] + "x" if nf() < 0.5 else orig["first"]
        l = orig["last"] + ("son" if nf() < 0.5 else "")
        recs[dup_id] = {"first": f, "last": l}
    return recs

for label, n in [("1K", 1000), ("10K", 10000)]:
    data = gen_synthetic(n, 42)
    print(f"\n=== dedupe {label} ({len(data)} records) ===")
    t0 = time.time()

    fields = [String("first"), String("last")]

    try:
        deduper = dedupe.Dedupe(fields, num_cores=2)
        sample_size = min(1500, len(data))
        keys = list(data.keys())[:sample_size]
        sample_data = {k: data[k] for k in keys}
        deduper.sample(sample_data, blocked_proportion=0.9, sample_size=1000)
        deduper.train()
        clusters = deduper.partition(data, threshold=0.5)
        pairs = sum(len(c[0]) - 1 for c in clusters if len(c[0]) > 1)
    except Exception as e:
        pairs = -1
        print(f"  ERR: {e}")

    elapsed = time.time() - t0
    print(f"  {elapsed:.1f}s, {pairs} match pairs")

print("\nSaved")
