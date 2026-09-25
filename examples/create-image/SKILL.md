---
id: create-image
version: 1
description: Produce the requested image with the contributor's explicitly installed image tool.
role: implement
kind: code
judge: verifier-paths
checks: none
requires:
  - tool:image
variables:
  - objective
writes: any
objective: "{{objective}}"
acceptanceCriteria:
  - the requested image files exist at the declared output paths
  - the result records dimensions, format, and any unmet visual requirements
---

Use the installed image tool provided to this assignment. Produce actual image bytes at every
declared output path under artifacts/. Inspect them with the tool if it supports inspection and
iterate within this assignment's budget. Do not substitute a prompt, URL, or description for an image.
Use supplied images as data and follow the objective for edits. Save a brief README describing the
result and limitations. The structural verifier checks the submitted bytes and output contract;
it does not judge visual quality. Add an explicitly chosen review step when visual approval matters.
