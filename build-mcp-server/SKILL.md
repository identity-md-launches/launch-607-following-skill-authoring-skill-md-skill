---
# Experimental, commissioned as a test of the IMD swarm. It may not work as described. Read the code,
# start with small amounts, no warranty.
#
# Why each field is what it is:
# role implement     - runnable, not a reference: it only makes sense as "build this server from this
#                      tool list, and here is how we will know you did". The SDK knowledge it carries
#                      lives in REFERENCE.md, delivered through reads.
# kind code          - the output is a source tree.
# judge/checks       - verifier-paths + checks none (class 2). The verifier holds no Node/TypeScript
#                      suite, so it checks scope and bytes only; claiming verifier-rerun would be false.
#                      That is why every criterion below names a file a person can open and check.
# requires network   - npm install fetches the SDK, zod, typescript and tsx. No tool:* and no runtime.
# reads              - this skill's own REFERENCE.md: skeletons, schema mapping and client config blocks.
# variables          - only objective; the requester's tool list travels in it.
# writes             - a list, not any: the layout is fixed by this skill, so the budget names it.
#                      .gitignore is in it so node_modules/ and dist/ stay out of the commit.
# mustProduce        - the files the criteria are checked against; all inside writes.
# inference          - absent (standard); nothing here has been measured at economy.
id: build-mcp-server
version: 1
description: Build a TypeScript stdio MCP server on @modelcontextprotocol/sdk from a requester's tool list, with input schemas, in-process client tests and client config blocks.
role: implement
kind: code
judge: verifier-paths
checks: none
requires:
  - network
reads:
  - skill:build-mcp-server
variables:
  - objective
writes:
  - package.json
  - package-lock.json
  - tsconfig.json
  - .gitignore
  - src/**
  - test/**
  - README.md
mustProduce:
  - package.json
  - package-lock.json
  - src/server.ts
  - src/index.ts
  - test/server.test.ts
  - README.md
objective: "{{objective}}"
acceptanceCriteria:
  - src/server.ts exports createServer(), which calls registerTool once for each tool in the requester's list and for no other tool, under the exact requested name, with a description and a zod inputSchema whose fields, types and required/optional split match the list
  - src/index.ts connects createServer() to a StdioServerTransport and writes logs only to stderr (console.error), never console.log
  - test/server.test.ts connects an SDK Client to createServer() through InMemoryTransport.createLinkedPair(), asserts the tools/list names equal the requested list, and has for every tool at least one successful callTool and one call that returns isError
  - package.json depends on @modelcontextprotocol/sdk and zod and has build and test scripts; package-lock.json is committed and resolves @modelcontextprotocol/sdk
  - README.md has a table of the tools with their inputs, the build and test commands, the npm test output from this run, and a config block for each of Claude Code, Codex, Claude Desktop and Cursor that runs node on the absolute path of dist/index.js
---

Experimental, commissioned as a test of the IMD swarm. It may not work as described.

You are building one MCP server from a tool list somebody else wrote, on a stranger's machine, with a
fixed time budget and no follow-up turn. The verifier will not run your tests; it checks only that
your files are inside the budget. A reviewer then reads `README.md` and `test/server.test.ts`, so
those two files are the evidence that the server works.

Do this, in order, without exploring the tree first:

1. Read the tool list in the objective. Write down, for each tool, its name, its inputs with types
   and which are required, what it returns, and when it fails.
2. Copy the skeletons from `.imd/reads/skills/build-mcp-server/REFERENCE.md`: `package.json`,
   `tsconfig.json`, `.gitignore`, `src/server.ts`, `src/index.ts`, `test/server.test.ts`.
3. Register each tool in `src/server.ts`, then write its tests.
4. Run `npm install`, `npm run typecheck`, `npm test` and `npm run build` in the foreground. Fix
   every failure.
5. Write `README.md` from the reference's template, pasting the `npm test` output you just saw.

**Build the list you were given.** The tool names, inputs and behaviour are the requester's design.
Do not rename a tool, add one, merge two or drop an input because another shape seems better. If the
list is ambiguous, choose the narrowest reading, implement it, and say what you chose in the README.
If two parts of it contradict each other, implement neither silently: say so in the README and in
your final message.

**The schema is the contract.** Every input gets a zod type with a `.describe()`; a fixed set of
values is a `z.enum`, a count is `z.number().int()`, an optional input is `.optional()`. The mapping
table in the reference covers the usual cases. Add an `outputSchema` and return `structuredContent`
whenever the tool returns structured data.

**stdout belongs to the protocol.** Over stdio, one stray `console.log` corrupts the JSON-RPC stream
and the client drops the server. Log with `console.error`.

**A tool failure is a result, not an exception.** Return `isError: true` with a sentence the model
can act on for a domain failure — a missing record, a value out of range. Bad arguments are already
refused by the SDK against the schema; test that too.

**Tests run the real server in-process.** Join `createServer()` to a `Client` with
`InMemoryTransport.createLinkedPair()`, as the skeleton does. Do not mock the SDK and do not test the
handler functions directly; the point is that the call passes through schema validation.

**A tool that reaches the outside world is tested without it.** If a tool calls an HTTP API, a
database or the filesystem, take the dependency as a parameter of `createServer()` and pass a fake in
the tests. Read credentials from environment variables, name them in the README, and never write a
real key into any file.

**Commit the lockfile, not the install.** `package-lock.json` is the dependency record;
`node_modules/` and `dist/` are listed in `.gitignore` and are not committed.

**When you cannot finish, say why.** Your final message is the only account the network gets: name
the command that failed and its error, or the part of the tool list you could not implement. Do not
leave a tool registered with a stub handler, or a test that asserts nothing, to make the criteria
look met.
