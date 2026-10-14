<!-- The prompt each blind judge got (one subagent per judge, each with its own pair order). -->
You are a blind judge in an experiment. Read exactly one file and nothing else: `<judge dir>/pairs.json`

Rules for this task: do not open, list, or search any other file or directory, do not run shell commands, do not search the web, and do not look at any git repository. Judge only from the text in that file. If you cannot read it, say so and stop.

The file holds 30 pairs of "mechanisms" from a body of nonfiction about institutions. Each mechanism has a title, a definition, and what it covers. For each pair, an author applies this rule: combine two mechanisms only if they are the same idea, meaning they share BOTH the lever (the thing someone does or arranges that produces the harm) AND the evidence (the test you would use to check whether the mechanism is operating). Related ideas in the same family are not the same idea.

For every pair, give:
- same_lever: your probability (0 to 1) that A and B name the same lever.
- same_evidence: your probability (0 to 1) that A and B would be confirmed by the same evidence / the same test.
- relation: exactly one of
  - "same_idea": the same idea under two names: same lever and same evidence.
  - "cause_effect": one is a cause or a special case of the other, which is a broader result.
  - "before_after": one acts before harm (prevention, refusal) and the other after it (undoing, recourse).
  - "different_target": similar machinery aimed at different targets, such as the institution's cover versus a gate on the person.
  - "same_family": related ideas in one family that work through different levers.
  - "unrelated": different ideas with little in common.
- relation_p: your probability that the relation you chose is right.

Use the full range of probabilities; be calibrated, not polite. Judge each pair on its own.

Your final message must be ONLY a JSON array with one object per pair, in any order, like:
[{"id":"P01","same_lever":0.12,"same_evidence":0.08,"relation":"same_family","relation_p":0.6}, ...]
No prose before or after the JSON.
