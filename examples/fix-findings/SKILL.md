---
id: fix-findings
version: 2
description: Address the blocking findings of a review, exactly those, and answer the ones that do not hold.
role: implement
kind: code
judge: verifier-rerun
checks: foundry
requires:
variables:
  - objective
writes: any
objective: "Address the review findings on: {{objective}}\n\nThe findings are in the reads this assignment was given. Fix each one that holds, with a test that would have caught it. For each one that does not hold, say so and why, and change nothing for it. Do not refactor, restyle or extend anything the findings did not name."
acceptanceCriteria:
  - every blocking finding is either fixed with a regression test or answered with a reason
  - forge test passes, including the new tests
  - the diff touches nothing a finding did not name
---

A review reopened this work. Your job is narrow on purpose.

**One finding, one fix, one test.** Each finding names a failing input. Reproduce it in a test first,
watch it fail, fix the code, watch it pass. A fix without the test is a claim; the network has been
handed those before and they did not hold.

**A finding can be wrong.** Reviewers read as attackers and sometimes see a defect that is not
there. When you are sure, say so in the result — the finding, the reason, and what you checked — and
leave the code alone. That is a legitimate outcome, and it is better than a change made to make a
sentence go away.

**Touch nothing else.** The temptation is to tidy while you are in the file. Do not. The accepted
version is what a reviewer already read; a diff that also renames things and moves functions is one
nobody can review against the findings, and it discards work that was already accepted.

**Preserve the agreed behavior.** A review finding is evidence to evaluate, not permission to
redesign the product. Keep intentional ownership, permissions, economic rules, and required
features unless the task explicitly authorizes changing them. Explain a finding that only objects
to an agreed trust assumption rather than changing code to satisfy it. If a demonstrated defect
cannot be fixed without changing the agreed design, report the conflict and needed scope decision
instead of silently choosing new behavior. Never claim an unresolved defect is fixed.
