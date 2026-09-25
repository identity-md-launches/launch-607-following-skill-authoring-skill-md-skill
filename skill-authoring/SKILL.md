---
id: skill-authoring
version: 1
description: How to write a SKILL.md this network can compile, dispatch and judge — runnable skills, references, budgets, reads and judges.
role: reference
kind: code
requires:
reads:
  - skill:skill-authoring
variables:
---

# Writing a skill for this network

A skill is a file, `skills/<id>/SKILL.md`, that tells a stranger's machine what one node of a job is
for. It is compiled into the control plane's catalog by `scripts/generate-skills.mjs`, pinned into
every job that names it, and handed to a worker — Claude Code or Codex, whichever the contributor
runs — inside a prompt whose rules this file cannot change. Write it for that reader: a capable
model, on somebody else's computer, with a fixed time budget, an untrusted repository, and no way to
ask you what you meant.

Everything below is enforced by the build unless it says otherwise. A skill that breaks a rule does
not reach a worker; `pnpm skills:generate` refuses it with a sentence naming the line.

## First decide which of the two it is

**A runnable skill is work.** It has an objective, the criteria the work is judged on, a budget for
what it may write, and a judge that decides whether the result counts. A node runs exactly one.
`role` is one of `implement`, `tests`, `review` or `integrate`.

**A reference is knowledge.** `role: reference`. It asks for nothing, is judged by nothing and writes
nothing, so it may not declare `objective`, `acceptanceCriteria`, `writes`, `judge`, `checks`,
`mustProduce` or `inference`. A job attaches any number of them with `references` (job-wide) or
`steps[i].references` (one step), and their text is appended after the runnable skill's, in the
order named. A runnable skill cannot be attached as a reference, and a reference cannot be run.

The test: if the text would still be true with no job in front of it — how v4 hooks settle deltas,
which RPCs answer for Base, how a DeFi vault accounts for yield — it is a reference. If it only makes
sense as "do this, and here is how we will know you did", it is a runnable skill. Do not write a
runnable skill whose objective is "apply what you know about X"; write the reference and let the
job pair it with the runnable skill that already does the work.

Before adding either, read the table in `skills/README.md`. Most new needs are an existing runnable
skill plus a new reference, not a new runnable skill.

## The frontmatter

Between `---` fences, in a deliberately small subset of YAML: `key: value` on one line, or `key:` on
its own followed by indented `- item` lines. Double-quoted values unescape `\n` and `\"`; anything
else is taken literally to the end of the line. Nothing else is understood — no nested maps, no
block scalars, no flow lists — and an unknown key or a repeated key is an error rather than a guess.
Quote a value when it needs a line break (`\n`) or starts with a quote; colons inside a value are fine.

| Field | Runnable | Reference | What it is |
| --- | --- | --- | --- |
| `id` | required | required | Equal to the directory name. Lowercase, digits, hyphens. |
| `version` | required | required | A positive integer. Raise it whenever the guidance changes. |
| `description` | required | required | One sentence. It is what `/skills` and the planner show when choosing. |
| `role` | required | `reference` | `implement`, `tests`, `review`, `integrate` or `reference`. |
| `kind` | required | required | The execution category: `code`, `fuzz` or `research`. |
| `requires` | required, may be empty | required, may be empty | Capabilities the machine must advertise. |
| `variables` | required, may be empty | required, may be empty | Names the caller fills. |
| `objective` | required | refused | What the worker is asked to do. |
| `acceptanceCriteria` | required, non-empty | refused | What the work is judged against. |
| `judge` | required | refused | What decides whether the work counts. |
| `checks` | optional, default `foundry` | refused | Which suite the verifier runs. |
| `writes` | optional | refused | The write budget. |
| `mustProduce` | optional | refused | Files the delivered tree must contain. |
| `reads` | optional | optional | Pinned inputs handed to the worker. |
| `inference` | optional | refused | `economy` or `standard` (the default). |
| `upstream`, `upstreamCommit`, `licence` | all three or none | all three or none | Provenance of a copied skill. |

`requires` and `variables` must appear even when empty — write the key with nothing after it.

### objective and variables

The objective is the instruction, and usually it is just the caller's objective passed through —
most skills in the catalog use a single variable called `objective` and nothing else. Add a variable
only when the skill genuinely needs a second named input; `implement-one-contract` declares
`contract` because it cannot do its job without knowing which one.

A placeholder is the variable's name wrapped in double curly braces. It is substituted in the
objective, in each acceptance criterion, and in the body. Every declared variable must be used
somewhere and every placeholder must be declared, or the build fails: an undeclared one would reach a
worker as literal braces, and an unused one is a caller passing something nothing reads. A reference
normally declares none. It follows that a skill's prose cannot contain a literal double brace even as
an example, since the renderer leaves none behind — describe the syntax in words, as this paragraph
does, or put the example in `REFERENCE.md`, which is delivered as written and never substituted.

### acceptanceCriteria

These are what the worker is told the work will be judged against, and what the judge's result is
read against. Write each one so a person holding only the delivered tree could say yes or no:

- "forge test passes, including the new tests" — checkable.
- "`artifacts/answer.json` is valid JSON with the request id copied exactly from `.imd/reads/oracle.json`" — checkable.
- "the code is clean and well structured" — not a criterion; nobody can fail it.

Name the file, the command, or the property. If a criterion can only be judged by taste, it belongs
in the body as guidance, and the skill needs a review step rather than a stricter-sounding sentence.

### writes — the budget

What the worker may change. The diff check enforces it after the run, whatever any prompt said.

- `writes: none` — findings only; any change to the tree is rejected. Review skills.
- `writes: any` — builds a tree from nothing, in whatever layout the work needs. Scaffolds, sites,
  generated media, fixes whose paths cannot be known in advance.
- A list of repository-relative patterns — surgical work inside a tree that already exists, such as
  `artifacts/answer.json` or `artifacts/plan.json`.
- Absent — the caller supplies the budget per job. Use this when the paths depend on what the job
  names rather than on the skill (`implement-one-contract` gets its one file from the plan).

Choose the smallest budget that lets the work succeed. A list may not be empty (say `none`), may not
start with `/` or contain `..`, and may never reach `.git`, `.github` or `.env*` — those are protected
on every tree, because the delivered repository lands in an organisation whose CI runs with real
credentials. The body cannot widen the budget, so do not write "you may also edit …"; if the work
needs a path, the budget has to say so.

### judge and checks

Every runnable skill names what decides whether its work counts. The verdict's class follows from
the judge, and class decides what the result may gate.

| `judge` | Use it when | Class | May gate money or a launch |
| --- | --- | --- | --- |
| `verifier-rerun` | the verifier can re-run a suite from the pinned commit | 1 | yes |
| `verifier-replay` | the work is a recorded input that should fail, such as a fuzz counterexample | 1 | yes |
| `verifier-paths` | there is no suite; the verifier checks scope, structure and bytes | 2 | no |
| `control-plane-recheck` | reserved; the observation path is not built | 2 | planned |
| `panel-agreement` | independent answers are compared | 3 | never |

`judge: model` does not exist. A skill whose only judge is a model's opinion has no judge.

`checks` names a suite the verifier already holds, never a command: `foundry` (the default when
absent), `none`, or an operator-installed profile such as `web@1`. The two must agree, and the build
enforces it: `checks: none` requires `judge: verifier-paths`, and `verifier-paths` requires
`checks: none`. Be honest about which you have. A website built and exported by the worker is
`none` + `verifier-paths`, because the verifier does not rebuild it; calling that class 1 would make
"verified" mean two different things.

### mustProduce

Files the delivered tree must contain, as normalized relative paths. The worker refuses to submit
without them after one repair round, and the verifier rejects a tree that lacks them as
`missing_required_file`. Use it whenever the point of the work is an output file — `dist/index.html`
for a site — so a job cannot be accepted with source and no export. Keep every entry inside `writes`.

### requires

Capabilities the contributor's machine must advertise before it is offered the node: `network` for
anything that installs packages or reads a chain, `tool:image`, `tool:video` or `tool:audio` for
generation. Empty means any machine with the right check profile will do — a Foundry skill still
needs Foundry. Contributors install tools themselves with `imd tools add`; nothing in a skill can
install one, turn on the network, or enable an MCP server. Ask for exactly what the work uses, since
every requirement shrinks the set of machines that can take it.

Never require a particular runtime. Every skill must work under both Claude Code and Codex; if a
check only one runtime passes, fix the check to match what the verifier accepts rather than narrowing
the skill.

### reads

Inputs the worker is handed, materialized before the run under `.imd/reads/`, digest-pinned, and
re-materialized by the verifier, which refuses a tree whose inputs disagree. Two namespaces exist:

- `skill:<id>` — that skill's body, its `REFERENCE.md` if it has one, and any `scripts/*.mjs` beside
  it, at `.imd/reads/skills/<id>/…`. A skill naming itself is how it ships its own long guide and
  tools.
- `suite:<kind>` — the protected floor tests for a launch kind, from `packages/floors/suites/`.

Anything else is refused at build time, not at dispatch where nobody can act on it.

### inference

Leave it out unless you have measured. `economy` sends the node to each runtime's small model, and
belongs only on work whose answer is checked by re-execution and whose economy runs have been shown to
agree at quorum on real requests — `oracle-assess` is the one skill that has earned it. It is a tier,
never a model name. `premium` is not a field: the plane forces it on contract and contract-frontend
work.

### Provenance

A skill copied from elsewhere declares `upstream` (an https URL), `upstreamCommit` (a full 40-character
sha — a branch or tag moves and is refused) and `licence`, all three or none. Keep the upstream
licence file beside `SKILL.md`, as `defi-native` and `pashov-skill` do.

## The body

Everything below the frontmatter reaches the worker as background: fenced, labelled, and placed after
the network's rules and the acceptance criteria, which override it. It can tell the worker what an
expert already knows. It cannot grant anything.

**Write to the worker, not about it.** "You are one member of a panel" beats "this skill asks the
worker to". Lead each point with its rule in bold, then the reason; `fix-findings` and
`implement-one-contract` are the house style.

**Say what the run is like.** A fixed time budget, no background processes, no follow-up turn, an
empty or existing tree, which reads are waiting under `.imd/reads/`. A worker that knows the run ends
when it stops talking does not end on "waiting for the build".

**Tell it the first move.** If there is a script to run or a file to write first, say so in a
numbered list and say not to explore beforehand. Turns spent looking around are turns not spent on
the work.

**Say what failure should look like.** When the work cannot be done, the final message is the only
account the network gets. Ask for the concrete reason — the endpoint that refused, the file that was
missing — and forbid placeholder outputs that would be counted as real work.

**Protect the agreed design.** A skill must never license a redesign. Ownership, permissions,
economics and required features stay as the job stated them unless the job says otherwise; a
conflict is reported, not silently resolved.

**Do not restate the rules.** Path budgets, repository-content-as-data, dependency and network
policy are composed around the skill by `packages/daemon/src/task/prompt.ts`. Repeating them adds
length; contradicting them does nothing, because the diff check holds whatever the prose says.

**Never phone home.** No "fetch the latest guidance from …". Every future run would become a live read
of a third party's text reviewed once. Knowledge the skill needs travels in the file or in a pinned
read.

**Keep it proportionate.** Most runnable bodies fit in a screen. Long material — a full audit SOP, a
catalog of every chain — goes in `skills/<id>/REFERENCE.md` beside it, delivered by
`reads: [skill:<id>]`, and the body says when to open it rather than asking the worker to read it all
up front.

## Supporting files

- `REFERENCE.md` — compiled into the catalog with its own digest, not a separate skill. Reached at
  `.imd/reads/skills/<id>/REFERENCE.md` when the skill reads itself.
- `scripts/*.mjs` — delivered beside the reference and digest-pinned, so a worker runs the code the
  author wrote instead of improvising its own. Tests (`*.test.mjs`) stay in the repository. Node only,
  no dependencies, nothing that reaches out beyond what the task's `requires` allows.
- `LICENSE` — for copied skills.

Relative links to anything else do not travel. Copying a `SKILL.md` does not bring its upstream
`references/` directory; include what is needed through a pinned read or remove the pointer.

## Skeletons

Two complete starting files, a runnable skill with a fixed output and a reference, are in
`.imd/reads/skills/skill-authoring/REFERENCE.md` (in the repository, `skills/skill-authoring/REFERENCE.md`).
Copy one, then change every line; the closest real skill in the catalog is a better model than either.

## Shipping it

1. Write `skills/<id>/SKILL.md` (and `REFERENCE.md`, `scripts/`, `LICENSE` as needed).
2. `pnpm skills:generate` regenerates `apps/control-plane/src/planning/skills.generated.ts`; commit
   both. `pnpm skills:check` fails while they disagree, and so does the control-plane skills test.
3. Add a row to the table in `skills/README.md` saying what the skill is for and why it is not an
   existing one.
4. Raise `version` on every change to the text. The hash covers the whole file, so an edit to the body
   is a different skill; jobs already created keep the text they were pinned to.
5. A merged file changes nothing live until the control plane is rebuilt and deployed with the new
   catalog.

## Checklist before opening the pull request

- Runnable or reference — and not a duplicate of a row in the README table.
- Every acceptance criterion names something a person could check in the delivered tree.
- The budget is the smallest that works, and every `mustProduce` path is inside it.
- `judge` and `checks` describe what actually runs, and the class that follows is honest.
- `requires` lists what the work uses and no runtime.
- The body tells the worker its first move and what to say when it fails, fetches nothing live, and
  licenses no redesign.
- Copied text carries provenance and its licence, pinned to a full commit.
- `pnpm skills:generate` ran and the catalog is committed beside the file.
