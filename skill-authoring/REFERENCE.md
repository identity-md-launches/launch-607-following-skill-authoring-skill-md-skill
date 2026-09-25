# Skill skeletons

Starting points for `skills/<id>/SKILL.md`. The rules each line follows are in this skill's
`SKILL.md`; nothing here is a real catalog entry.

## A runnable skill with a fixed output

```
---
id: token-holder-report
version: 1
description: Report the top holders of an ERC-20 at a pinned block, with the query that reproduces it.
role: implement
kind: research
judge: verifier-paths
checks: none
requires:
  - network
variables:
  - objective
writes:
  - artifacts/holders.json
  - artifacts/README.md
mustProduce:
  - artifacts/holders.json
objective: "{{objective}}"
acceptanceCriteria:
  - artifacts/holders.json lists address and balance for each holder, largest first, at the block the objective names
  - artifacts/README.md states the RPC, block and method used, so the list can be reproduced
---

You are answering at one block, and a verifier will not rerun you, so the README is the only proof.

1. Read the token and block from the objective. Do not explore the tree first.
2. Compute balances at exactly that block from one of the public endpoints for the chain.
3. Write `artifacts/holders.json`, then `artifacts/README.md`.

**Answer at the pinned block.** A later block is a different answer.

**When you cannot finish, say why.** Name the endpoint that refused and its error in your final
message. Do not write a partial list as if it were complete.
```

## A reference

```
---
id: chainlink-vrf
version: 1
description: How Chainlink VRF v2.5 requests and fulfils randomness, and what to test.
role: reference
kind: code
requires:
variables:
---

# Chainlink VRF

What is true about the integration regardless of the job: the request and fulfilment flow,
configuration inputs, the failure modes worth a test, and deployment prerequisites, with
reviewed source references.
```

## A runnable skill with a second variable

```
---
id: implement-one-contract
version: 1
description: Write one contract out of several being built in parallel by different workers.
role: implement
kind: code
judge: verifier-rerun
requires:
variables:
  - objective
  - contract
objective: "{{objective}}\n\nImplement the {{contract}} contract."
acceptanceCriteria:
  - forge build succeeds
  - "{{contract}} implements the stated behavior"
---
```

No `writes`: the plan grants the one file per job. `checks` is absent, so it is `foundry`, which is
what lets `verifier-rerun` claim class 1.
