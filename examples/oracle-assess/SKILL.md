---
id: oracle-assess
version: 2
description: Answer a typed on-chain question from a pinned request, with the recipe that reproduces it.
role: implement
kind: code
judge: verifier-paths
checks: none
inference: economy
requires:
  - network
reads:
  - skill:oracle-assess
variables:
  - objective
writes:
  - artifacts/answer.json
objective: "{{objective}}"
acceptanceCriteria:
  - artifacts/answer.json is valid JSON in the member answer shape, with the request id, chain and window copied exactly from .imd/reads/oracle.json
  - node .imd/reads/skills/oracle-assess/scripts/check-answer.mjs prints ok for artifacts/answer.json before you finish
  - the answer was computed over exactly the pinned block range, and the recipe named in it reproduces the answer from public RPC data alone
  - every definition the request left open is stated under definitions and used consistently
---

You are one member of a panel. Several contributors answer this question independently and the
control plane compares the answers; the deployer then reruns your recipe at the same blocks and signs
only if it lands on the same answer. Your reasoning is welcome in `notes`; nothing in it executes.

Your objective already carries the brief: the question, the chain, the exact block range with the
closing block's hash, the answer's type, the definitions the requester fixed, and verified public
endpoints for the chain. The same brief is in `.imd/reads/oracle.json`, with the parameters each
recipe kind takes under `recipes`. Do not begin by reading files. Three steps, and no turns spent
looking around first:

1. Compute the answer with `node .imd/reads/skills/oracle-assess/scripts/scan.mjs` over exactly the
   pinned blocks, from one of the endpoints in the brief. A panel-evidence question has no scan:
   read one or two sources that state the fact and note which.
2. Write `artifacts/answer.json`.
3. Run `node .imd/reads/skills/oracle-assess/scripts/check-answer.mjs` and fix every line it prints.

Scan again only when the total is zero or the checker objects; one complete scan is otherwise
enough. Open `.imd/reads/skills/oracle-assess/REFERENCE.md` only when the checker names a recipe
field you did not set. Do not widen the window, do not choose another chain, do not answer a
different question.

This run has a fixed time budget and nothing waits after it: there is no background, and a run that
ends without `artifacts/answer.json` is a failed seat. Run every command in the foreground and wait
for it; a command sent to the background is never collected, and a run that ends "waiting for the
scan to finish" has produced nothing. If the scan cannot fit, use larger ranges, a second endpoint,
or both, and if it still cannot, say so in a final message rather than promising to finish later.
Whenever you end without writing `artifacts/answer.json`, for any reason, your last message is the
only account of this seat the network gets: say in a line or two what stopped you — the endpoint
that refused and its error, the source that had no figure, the definition you could not satisfy.
Do not write a placeholder answer to fill the file; a value you did not compute counts as a vote.

A total of zero over a busy window is almost never the answer: it is the wrong event signature or
the wrong address. The scan script says which events the contract did emit when a filtered scan
matches nothing — read that line, fix the signature (PancakeSwap v3's Swap carries two protocol-fee
fields that Uniswap v3's does not, for instance), and scan again before writing anything down.

A Uniswap v4 volume ranking is one command: `scan.mjs --v4` with the pool manager, the token and the
block the manager's history starts at, all from the brief and the reference. It prints the answer
and the recipe to paste. Do not rebuild that computation by hand.

Write only `artifacts/answer.json`:

```json
{
  "v": 1,
  "requestId": "<from the brief>",
  "chainId": 1,
  "window": { "fromBlock": 0, "toBlock": 0, "toBlockHash": "0x…" },
  "answerType": "bytes32[]",
  "answer": ["0x…"],
  "figure": "12345",
  "definitions": { "denomination": "…" },
  "recipe": { "kind": "v4-volume-rank", "poolManager": "0x…", "token": "0x…", "initializedSince": 21688329, "topN": 5 },
  "notes": "how you computed it and what you assumed"
}
```

The recipe must be one of exactly five kinds — `log-sum`, `log-rank`, `call-compare`,
`v4-volume-rank`, or `panel` for a panel-evidence question — with exactly the parameters the brief
lists for it under `recipes` and nothing else. There is no other kind; a recipe the deployer
cannot rerun is refused unread, and the question may end disagreed on it. Put how you ran it in
`notes`, not in the recipe. The checker applies the plane's own rules, and an answer it passes is
an answer that is read. The scan script fetches the logs, halves a refused range, confirms the
pinned hash, and prints only the count, the sum or the ranking. Never print logs, transactions or
RPC responses: you need the totals, and thousands of logs in your transcript is what makes a
two-minute task a ten-minute one. The deployer reruns your recipe before anything is signed, so a
second scan of your own is a cost with no reader. State in `definitions` anything the question
left open that changed what you computed, such as the token a volume is denominated in. Addresses
and hashes are lowercase. A list answer is ordered as the question asks, with ties broken by
ascending key. A uint256 is a decimal string. If the
question cannot be answered from the catalogue's recipes over the pinned window, say so in `notes`,
put the closest honest computation in the recipe, and set `answer` to what that computation yields.
