"""Score blind-judge outputs against the answer key.

Usage: python3 -I score.py key.json judge1.json judge2.json judge3.json
score = P(same lever) x P(same evidence); PASS if every merge outscores every
pair the author ruled distinct (same rule as scratch/clef-probe.ts).
"""
import json
import sys

key = {k["id"]: k for k in json.load(open(sys.argv[1]))}
judges = [{r["id"]: r for r in json.load(open(path))} for path in sys.argv[2:]]


def score(r):
    return r["same_lever"] * r["same_evidence"]


def verdict(scores):
    merges = [s for i, s in scores.items() if key[i]["label"] == "merge"]
    distinct = [s for i, s in scores.items() if key[i]["label"] == "distinct"]
    unruled = [s for i, s in scores.items() if key[i]["label"] == "unruled"]
    low = min(merges)
    return {
        "pass": low > max(distinct),
        "lowest_merge": round(low, 3),
        "highest_distinct": round(max(distinct), 3),
        "unruled_at_or_above_lowest_merge": sum(s >= low for s in unruled),
    }


for n, judge in enumerate(judges, 1):
    missing = set(key) - set(judge)
    if missing:
        print(f"judge {n}: missing {sorted(missing)}")
        continue
    print(f"judge {n}:", verdict({i: score(r) for i, r in judge.items()}))

mean = {i: sum(score(j[i]) for j in judges) / len(judges) for i in key}
print("mean:", verdict(mean))
print()
print(f"{'id':4} {'label':9} {'mean':>5}  per-judge          relations              pair (nomic)")
for i in sorted(key, key=lambda i: -mean[i]):
    k = key[i]
    per = " ".join(f"{score(j[i]):.2f}" for j in judges)
    rel = ",".join(j[i]["relation"].replace("_", "")[:8] for j in judges)
    nomic = f" ({k['nomic']:.2f})" if k["nomic"] is not None else ""
    print(f"{i:4} {k['label']:9} {mean[i]:5.2f}  {per:18} {rel:22} {k['a']} ~ {k['b']}{nomic}")
