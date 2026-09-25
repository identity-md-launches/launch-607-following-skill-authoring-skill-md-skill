#!/usr/bin/env node
/**
 * Checks SKILL.md files against the rules the identity.md control plane applies when it compiles its
 * skill catalog. Ported from scripts/generate-skills.mjs in the protocol repository; the rules are the
 * same, and only the catalog output is left out.
 *
 *   node check-skill.mjs <skill-dir> [<skill-dir> ...]
 *
 * A skill directory is named after the skill's id and holds SKILL.md (and optionally REFERENCE.md,
 * scripts/*.mjs). Exits non-zero with the reason on the first file that would be refused.
 * No dependencies; Node 18 or later.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { join } from "node:path";

const JUDGES = {
  "verifier-rerun": 1,
  "verifier-replay": 1,
  /**
   * The verifier confirmed the diff is legal and is what was claimed, and did not confirm it works.
   *
   * Class 2 rather than 1, and the difference is the whole point of having it. A re-run is evidence
   * the work does what it says; this is evidence only that the work is what was sent. It is the
   * honest verdict for something the verifier has no suite for — and calling it class 1 would make
   * "verified" mean two different things depending on which skill produced the row.
   */
  "verifier-paths": 2,
  "control-plane-recheck": 2,
  "panel-agreement": 3,
};

/**
 * Which suite the verifier runs on this skill's work.
 *
 * A closed set, and it stays closed for a reason that is not tidiness: the verifier is the process
 * that executes untrusted Solidity, and a skill naming its own command would be a pull request
 * running code there. The names map to suites the verifier already holds; a new one is a change to
 * the verifier with its own review, never a string in a contributed file.
 *
 * `none` is for work the verifier has no suite for. It is honest rather than permissive — the
 * verdict that comes back says the diff was legal and was what was claimed, and says nothing about
 * whether the work works.
 */
const PROFILE_ID = /^[a-z][a-z0-9_-]{0,63}(?:@[1-9][0-9]{0,5})?$/;

/**
 * The two things a skill can be, and why they are not the same thing.
 *
 * A **role** skill is an instruction: an objective, the criteria the work is judged on, a budget, a
 * judge. One per node, because a node does one job.
 *
 * A **reference** skill is knowledge: text and nothing else. It has no objective because it asks for
 * nothing, no criteria because it is not judged, and no budget because it writes nothing. Several
 * apply to one node, because knowing about v4 hooks and knowing how this network wants a contract
 * written are different things and a worker needs both.
 *
 * The distinction arrived with the first import. Uniswap's `v4-security-foundations` is eighteen
 * thousand characters of threat model with no instruction anywhere in it — forcing it into the role
 * shape would have meant discarding either its knowledge or the role's instruction.
 */
const ROLES = ["implement", "tests", "review", "integrate", "reference"];

const SCALAR_FIELDS = [
  "id",
  "version",
  "description",
  "role",
  "kind",
  "judge",
  "checks",
  "objective",
  /**
   * Where a copied skill came from, and under what terms.
   *
   * A skill from somewhere else is supply-chain intake: text somebody else wrote, dispatched by us
   * to strangers' machines, spending their subscriptions. `upstream` names the repository,
   * `upstreamCommit` pins the exact revision that was read, and `licence` records the terms it was
   * read under — because this is redistribution, and a skill nobody can point back to a commit is a
   * skill nobody can audit against what its author actually published.
   *
   * All three or none. A skill written here says nothing and is understood to be ours.
   */
  "upstream",
  "upstreamCommit",
  "licence",
  /**
   * How much model the work needs: `economy` or `standard` (the default).
   *
   * A tier, never a vendor model name. The plane forwards it on the task and the daemon maps it to
   * the runtime it runs — the small model at low effort for `economy` — with the contributor able
   * to override the mapping on their own machine, since the models on their subscription are theirs
   * to know. Not a judge: it decides what answers, never what is accepted.
   */
  "inference",
];
const INFERENCE_TIERS = ["economy", "standard"];
const LIST_FIELDS = ["requires", "variables", "acceptanceCriteria", "reads", "mustProduce"];

/**
 * What a `reads:` entry may name, and what each namespace resolves to.
 *
 * The symmetry with `writes:` is the point. A skill has always declared what it may change; this is
 * what it is given, and it is enforced the same way — materialized before the run, part of the input
 * tree hash, re-materialized by the verifier from its own copy and refused if the hash disagrees.
 *
 * Two rules govern adding one, and the second is the one worth arguing about.
 *
 * It must be deterministic, or the verifier cannot reproduce what the worker was handed and the hash
 * means nothing.
 *
 * And it must be a floor rather than a proxy for quality. A suite asserting a minimum is safe to
 * hand a worker: code written to clear a floor clears it. A suite standing in for "is this good"
 * becomes something to satisfy instead of something to pass, and the network would get exactly what
 * was measured and nothing more. `invariants.ts` argues the fleet should reach none of this at all —
 * the answer is that it never reaches the verifier's copy, which is the one that judges, and that
 * this line is where the argument actually lives.
 */
const READ_NAMESPACES = {
  /** `suite:<kind>` — the protected floor for a launch kind, from `packages/floors/suites/<kind>/`. */
  suite: /^[a-z][a-z0-9_]{0,32}$/,
  /** `skill:<id>` — another skill's body as text, which is what job-level references do today. */
  skill: /^[a-z][a-z0-9-]{0,63}$/,
};

/**
 * `writes:` is the one field that is a scalar or a list depending on what it says.
 *
 * `none` produces findings and changes nothing. `any` builds a tree from nothing and writes as many
 * files, in whatever layout, as the work takes. A list is surgical work inside a tree that already
 * exists. Absent means the caller supplies the budget, which is every skill written before this
 * field and every skill whose paths depend on what the job named rather than on the skill itself.
 */
const WRITES_KEYWORDS = ["none", "any"];

class SkillError extends Error {
  constructor(id, message) {
    super(`${id}/SKILL.md: ${message}`);
  }
}

/**
 * Frontmatter, in a subset small enough to be read at a glance.
 *
 * `key: scalar` and `key:` followed by indented `- item` lines. Double-quoted scalars unescape `\n`
 * and `\"`; everything else is taken literally to its end of line. Anything this does not recognise
 * is an error rather than a guess — the same reason no schema in `packages/protocol` transforms its
 * input. A frontmatter that is quietly misread produces a worker told something nobody wrote.
 */
function parseFrontmatter(id, text) {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) throw new SkillError(id, "no frontmatter block");

  const fields = {};
  let list = null;

  for (const [index, raw] of match[1].split("\n").entries()) {
    const line = raw.replace(/\s+$/, "");
    const at = `line ${index + 2}`;
    if (line === "" || line.startsWith("#")) continue;

    if (/^\s+-\s/.test(line)) {
      if (!list) throw new SkillError(id, `${at}: a list item with no key above it`);
      fields[list].push(unquote(id, at, line.replace(/^\s+-\s+/, "")));
      continue;
    }

    const pair = /^([A-Za-z][A-Za-z0-9]*):(?:\s+(.*))?$/.exec(line);
    if (!pair) throw new SkillError(id, `${at}: expected "key: value" or a list item, got ${line}`);

    const [, key, value] = pair;
    if (key in fields) throw new SkillError(id, `${at}: ${key} appears twice`);

    if (key === "writes") {
      if (value) {
        if (!WRITES_KEYWORDS.includes(value)) {
          throw new SkillError(id, `${at}: writes takes ${WRITES_KEYWORDS.join(" or ")}, or a list of patterns`);
        }
        fields.writes = value;
        list = null;
        continue;
      }
      fields.writes = [];
      list = "writes";
      continue;
    }
    if (key === "reads") {
      if (value) throw new SkillError(id, `${at}: reads is a list, so its items go on their own lines`);
      fields.reads = [];
      list = "reads";
      continue;
    }
    if (LIST_FIELDS.includes(key)) {
      if (value) throw new SkillError(id, `${at}: ${key} is a list, so its items go on their own lines`);
      fields[key] = [];
      list = key;
      continue;
    }
    if (!SCALAR_FIELDS.includes(key)) throw new SkillError(id, `${at}: unknown field ${key}`);
    if (!value) throw new SkillError(id, `${at}: ${key} has no value`);
    fields[key] = unquote(id, at, value);
    list = null;
  }

  return fields;
}

function unquote(id, at, value) {
  if (!value.startsWith('"')) return value;
  if (!value.endsWith('"') || value.length < 2) throw new SkillError(id, `${at}: unclosed quote`);
  return value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"');
}

const placeholders = (text) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);

function readSkill(dir) {
  const id = basename(dir);
  const source = readFileSync(join(dir, "SKILL.md"), "utf8");
  const fields = parseFrontmatter(id, source);
  // Everything below the frontmatter. For the skills written here that is rationale for whoever
  // reviews the file; for a skill imported from elsewhere it is the whole point of the file, because
  // theirs are written as prose rather than as fields. Both now reach the worker.
  const guidance = source.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();

  // A reference asks for nothing and is judged by nothing, so the fields that describe asking and
  // judging are meaningless on one — requiring them would mean inventing an objective for a
  // document. `checks` defaults to foundry, and provenance is absent on anything written here.
  const reference = fields.role === "reference";
  const OPTIONAL = new Set([
    "checks",
    "upstream",
    "upstreamCommit",
    "licence",
    "inference",
    ...(reference ? ["objective", "judge"] : []),
  ]);
  const required = [
    ...SCALAR_FIELDS.filter((key) => !OPTIONAL.has(key)),
    ...(reference ? [] : ["acceptanceCriteria"]),
    "variables",
    "requires",
  ];
  for (const key of required) {
    if (!(key in fields)) throw new SkillError(id, `missing ${key}`);
  }
  if (fields.id !== id) throw new SkillError(id, `declares id ${fields.id}`);
  if (!/^[1-9][0-9]*$/.test(fields.version)) throw new SkillError(id, "version must be a positive integer");
  if (!ROLES.includes(fields.role)) {
    throw new SkillError(id, `role must be one of ${ROLES.join(", ")} — got ${fields.role}`);
  }
  if (fields.inference !== undefined) {
    if (reference) throw new SkillError(id, "a reference runs nothing, so it has no inference tier");
    if (!INFERENCE_TIERS.includes(fields.inference)) {
      throw new SkillError(id, `inference must be one of ${INFERENCE_TIERS.join(", ")} — got ${fields.inference}`);
    }
  }
  if (reference) {
    for (const key of ["objective", "acceptanceCriteria", "writes", "judge", "checks"]) {
      if (key in fields) {
        throw new SkillError(id, `a reference is knowledge, not work — it may not declare ${key}`);
      }
    }
    if (!fields.description) throw new SkillError(id, "missing description");
  }
  if (!reference && !(fields.judge in JUDGES)) {
    throw new SkillError(id, `judge must be one of ${Object.keys(JUDGES).join(", ")} — got ${fields.judge}`);
  }

  // Absent means `foundry`, decided here rather than by a default, so every skill written before
  // this field keeps the suite it was already getting. A reference runs nothing, so it names nothing:
  // a catalog that said a document was judged by a Foundry suite would be describing work that does
  // not exist.
  const checks = reference ? null : (fields.checks ?? "foundry");
  const mustProduce = fields.mustProduce ?? [];
  if (!Array.isArray(mustProduce) || mustProduce.some((path) => typeof path !== "string" || !/^[A-Za-z0-9_.\-/]+$/.test(path) || path.startsWith("/") || path.split("/").some((part) => part === ".." || part === "" || part === "."))) {
    throw new SkillError(id, "mustProduce must be a list of normalized relative paths");
  }
  if (reference && mustProduce.length > 0) throw new SkillError(id, "a reference produces nothing, so it cannot declare mustProduce");
  if (!reference && !PROFILE_ID.test(checks)) {
    throw new SkillError(id, `checks must be a profile identifier — got ${checks}`);
  }
  // A skill running no suite cannot claim a verdict that means a suite was re-run. Refused here so
  // the pairing cannot be got wrong in a file, rather than trusted to whoever reads the row later.
  if (!reference && checks === "none" && fields.judge.startsWith("verifier-re")) {
    throw new SkillError(id, `checks: none runs nothing, so judge must be verifier-paths, not ${fields.judge}`);
  }
  if (!reference && checks !== "none" && fields.judge === "verifier-paths") {
    throw new SkillError(id, `judge: verifier-paths claims nothing ran, but checks is ${checks}`);
  }

  // Provenance is all-or-nothing. A skill that names where it came from must also say which revision
  // was read and under what licence, or the citation is decoration: nobody can diff it against what
  // its author published, and nobody can tell whether redistributing it was allowed.
  const provenance = ["upstream", "upstreamCommit", "licence"].filter((key) => key in fields);
  if (provenance.length > 0 && provenance.length < 3) {
    const missing = ["upstream", "upstreamCommit", "licence"].filter((key) => !(key in fields));
    throw new SkillError(id, `a copied skill needs ${missing.join(", ")} as well — all three or none`);
  }
  if (fields.upstreamCommit && !/^[0-9a-f]{40}$/.test(fields.upstreamCommit)) {
    throw new SkillError(id, `upstreamCommit must be a full 40-character sha, not ${fields.upstreamCommit}`);
  }
  // A branch or a tag is not a revision: both move, and a skill pinned to one is a skill whose text
  // can change under it without anyone here reviewing the change.
  if (fields.upstream && !/^https:\/\//.test(fields.upstream)) {
    throw new SkillError(id, `upstream must be an https URL, got ${fields.upstream}`);
  }
  if (!reference && fields.acceptanceCriteria.length === 0) {
    throw new SkillError(id, "no acceptance criteria");
  }

  const writes = fields.writes ?? null;
  if (Array.isArray(writes)) {
    if (writes.length === 0) throw new SkillError(id, "writes is a list with nothing in it — say none instead");
    // A budget reaching CI is refused here rather than at planning time, so a contributed skill
    // cannot carry one at all. The delivered repository lands in our organisation and a workflow
    // there runs with our credentials; that is not a thing a pull request may grant itself.
    for (const pattern of writes) {
      if (/^\.github\b/.test(pattern) || /^\.git\b/.test(pattern) || /^\.env/.test(pattern)) {
        throw new SkillError(id, `writes may not reach ${pattern} — it is protected on every tree`);
      }
      if (pattern.startsWith("/") || pattern.includes("..")) {
        throw new SkillError(id, `writes pattern ${pattern} is not repository-relative`);
      }
    }
  }

  // A variable used but not declared reaches a worker as a literal `{{contract}}`, and one declared
  // but never used is a caller passing something nothing reads. Both are silent; neither should be.
  // The body is substituted too, so it counts. For a reference it is the only place a variable can
  // appear at all, having no objective and no criteria to put one in.
  const used = new Set(
    [fields.objective ?? "", ...(fields.acceptanceCriteria ?? []), guidance].flatMap(placeholders),
  );
  /**
   * Every read names a namespace the resolver knows and a value that namespace accepts.
   *
   * Refused here rather than at dispatch, because a skill naming a suite nobody wrote is a job that
   * would be planned, offered, and refused on a worker's machine — where the reason reaches nobody
   * who can act on it. The catalog build is where an author is still looking.
   */
  for (const read of fields.reads ?? []) {
    const [namespace, ...rest] = read.split(":");
    const value = rest.join(":");
    const pattern = READ_NAMESPACES[namespace];
    if (!pattern) {
      throw new SkillError(
        id,
        `reads ${read}: unknown namespace "${namespace}", expected one of ${Object.keys(READ_NAMESPACES).join(", ")}`,
      );
    }
    if (!pattern.test(value)) throw new SkillError(id, `reads ${read}: "${value}" is not a valid ${namespace} name`);
  }

  const declared = new Set(fields.variables);
  for (const name of used) if (!declared.has(name)) throw new SkillError(id, `uses {{${name}}} without declaring it`);
  for (const name of declared) if (!used.has(name)) throw new SkillError(id, `declares ${name} and never uses it`);

  return {
    id,
    version: Number(fields.version),
    description: fields.description,
    role: fields.role,
    kind: fields.kind,
    judge: reference ? null : fields.judge,
    tier: reference ? null : JUDGES[fields.judge],
    checks,
    upstream: fields.upstream ?? null,
    upstreamCommit: fields.upstreamCommit ?? null,
    licence: fields.licence ?? null,
    requires: fields.requires,
    inference: reference ? null : (fields.inference ?? "standard"),
    // What this skill is given, symmetric with `writes:`. Empty for anything that asked for nothing,
    // which is every skill written before the field existed.
    reads: fields.reads ?? [],
    // Files the delivered tree must contain. The worker refuses to submit without them and the
    // verifier rejects a tree without them, so a skill that promises an export delivers one.
    mustProduce,
    variables: fields.variables,
    objective: fields.objective ?? "",
    acceptanceCriteria: fields.acceptanceCriteria ?? [],
    guidance,
    // Supporting knowledge travels as a pinned read without becoming a second catalog entry.
    ...(existsSync(join(dir, "REFERENCE.md"))
      ? { referenceContent: readFileSync(join(dir, "REFERENCE.md"), "utf8") }
      : {}),
    // And so does a tool: a script under `scripts/` is delivered beside the reference, digest-pinned
    // like it, so a worker runs the code the skill's author wrote rather than writing its own each
    // time. Tests beside it stay here.
    ...(existsSync(join(dir, "scripts"))
      ? { files: readdirSync(join(dir, "scripts")).filter((name) => name.endsWith(".mjs") && !name.endsWith(".test.mjs")).sort()
          .map((name) => ({ path: `scripts/${name}`, content: readFileSync(join(dir, "scripts", name), "utf8") })) }
      : {}),
    writes,
    // The whole file, so an edit anywhere in it — including the rationale a reviewer reads — is a
    // different skill. What a contributor was told is not only its frontmatter.
    hash: createHash("sha256").update(source).digest("hex"),
  };
}


/**
 * Two more rules the protocol's test suite applies to every skill body, which the catalog build alone
 * does not: a body may not contain a literal double brace (none survives rendering), and may not carry
 * lines that look like leaked frontmatter.
 */
function checkBody(skill) {
  if (/\{\{/.test(skill.guidance.replace(/\{\{\w+\}\}/g, ""))) {
    throw new SkillError(skill.id, "the body contains a double brace that is not a declared placeholder");
  }
  if (/^id:|^judge:|^writes:/m.test(skill.guidance)) {
    throw new SkillError(skill.id, "the body has a line starting id:, judge: or writes: — move example frontmatter into REFERENCE.md");
  }
}

const dirs = process.argv.slice(2).map((arg) => resolve(arg.replace(/\/SKILL\.md$/, "")));
if (dirs.length === 0) {
  console.error("usage: node check-skill.mjs <skill-dir> [<skill-dir> ...]");
  process.exit(2);
}

let failed = false;
for (const dir of dirs) {
  try {
    const skill = readSkill(dir);
    checkBody(skill);
    const shape = skill.role === "reference" ? "reference" : `${skill.role}, judge ${skill.judge} (class ${skill.tier}), checks ${skill.checks}`;
    console.log(`ok  ${skill.id} v${skill.version}: ${shape}`);
  } catch (error) {
    if (!(error instanceof SkillError)) throw error;
    console.error(`bad ${error.message}`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
