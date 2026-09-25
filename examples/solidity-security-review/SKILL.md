---
id: solidity-security-review
version: 2
description: Lightweight Solidity threat-model reference for a scoped review; does not create a review assignment.
role: reference
kind: code
requires:
variables:
---

# Reviewing Solidity as an attacker

This is background for a reviewer. It is not a list to tick; it is the set of questions an attacker
asks of a contract, in the order they usually pay off. A finding is only a finding with a concrete
failing input and the expected-versus-actual result.

## Who can call what

- Every state-changing function: who is allowed, and is that checked on every path including the
  fallback and receive functions? A missing modifier on one overload is the whole exploit.
- Initialisers on upgradeable or cloned contracts: can `initialize` be called twice, or by anyone,
  or on the implementation itself?
- Ownership transfer: is there a two-step handover, and can the owner be set to zero by mistake?
- Roles that can mint, pause, upgrade, sweep or set fees: document their powers and trust
  assumptions separately. An intentional role is not itself a finding. Report a concrete permission
  bypass or violation of the requested behavior; suggested fixes must preserve the agreed design.

## Value in and out

- Reentrancy on every external call that happens before state is settled: ETH transfers, ERC-721
  and ERC-1155 receiver hooks, ERC-777 and ERC-1363 callbacks, arbitrary `call`. Checks, effects,
  then interactions; a guard where the order cannot be fixed.
- Push versus pull: a payment that reverts, or a receiver that reverts on purpose, must not block
  other users' funds. A single blocked address must not freeze a queue, an auction or a round.
- Tokens that lie: fee-on-transfer, rebasing, tokens returning no boolean, tokens returning false.
  Measure balances before and after rather than trusting the amount argument.
- Rounding direction on every division: who gains the dust, and can it be farmed by repetition?
- Conservation: after any sequence of operations, does the contract's balance equal what it owes?
  A test that asserts this invariant catches more than most unit tests.

## Arithmetic and limits

- Overflow in unchecked blocks, in multiplication before division, in casts to smaller integers,
  in `uint256` to `int256` conversions.
- Precision loss when multiplying then dividing with small numerators, and when scaling between
  tokens of different decimals.
- Unbounded loops over user-controlled arrays: the gas cost is the attacker's lever.
- Block gas limit and calldata size on functions that batch.

## Time, ordering and randomness

- Anything read from `block.timestamp` or `block.number` can be nudged by a builder; anything read
  from `blockhash` or `prevrandao` can be chosen by one. On-chain randomness is not randomness.
- Front-running and sandwiches on any function whose result depends on state a public mempool can
  see coming: pricing, auctions, first-come claims, permit and signature submission.
- Deadlines and expiries: off by one at the boundary, and what happens exactly at expiry.
- Commit-reveal schemes: can the reveal be withheld, and who bears that cost?

## Signatures and identity

- Replay: every signed message needs the chain id, the contract address, a nonce and an expiry, and
  the nonce must be consumed before the effect.
- Malleability of `ecrecover` outputs, and `ecrecover` returning the zero address on a bad signature.
- ERC-1271 contract signatures: is the caller's `isValidSignature` trusted, and can it change its
  mind between check and use?
- `tx.origin` used for authorisation is a phishing vector, always.

## External dependencies

- Oracles: staleness, a zero or negative answer, a paused feed, a price manipulable within one
  transaction (spot prices from a pool are not oracles).
- Delegatecall to anything not fully controlled: storage layout collisions, selfdestruct in the
  target, and a target that can be replaced.
- Upgradeability: who upgrades, is storage layout append-only, and is there a timelock?
- Inherited code: what does the base contract do that this one did not intend to expose?

## What the tests do not cover

- Read the tests as an attacker too. A suite that only aligns to happy paths, that fixes timestamps
  to round numbers, or that never calls a function twice is a suite that has not exercised the
  edges above. Say which edges are untested; that is a finding of its own.
