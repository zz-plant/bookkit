---
title: Shift rhythm
description: The three beats of an on-call shift.
tags: [ops, rhythm]
date: 2026-03-02
author: Sam
---

# Shift rhythm

A shift has three beats: **arrive**, **hold**, **hand off**.

| Signal | Action |
| --- | --- |
| Pager | Classify first |
| Slack ping | Batch it |

Use the [handoff checklist][checklist].

[checklist]: 03-handoff-checklist.md

```bash
oncall handoff --to @next --note "{state}" <<EOF
```
