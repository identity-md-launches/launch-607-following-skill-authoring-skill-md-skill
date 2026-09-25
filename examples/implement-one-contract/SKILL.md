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

You are writing one contract. Other contributors are writing the others, right now, on other
machines, and none of you can see each other's work.

**Only your own contract's file is yours.** Your paths list it. Everything else in the repository —
including the contracts your colleagues are writing this minute — is off limits and a submission
touching them is rejected.

**Assume the others do not exist yet.** If your contract needs an interface from one of theirs, write
against the interface as the objective describes it rather than against an implementation you cannot
see. Do not create their file to make yours compile.

**Say what you assumed.** Your final message is the only place a mismatch between two contracts gets
noticed before the integrating node hits it. If you had to guess at a signature or a behaviour, name
the guess.

**Do not modify the build.** No dependencies, no configuration, no network.
