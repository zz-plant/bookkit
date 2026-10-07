---
description: "Build every book and verify its output"
agent: build
---
bun run build:all && bun run check:build
