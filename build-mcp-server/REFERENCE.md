# build-mcp-server reference

Skeletons and templates for the files this skill delivers. Copy them, then change every name. A
complete worked example built from these lives beside the skill in the repository, under
`build-mcp-server/example/`.

Versions below were installed and tested together (SDK 1.32, zod 4, TypeScript 5.9, tsx 4, Node 20+).
Keep the caret ranges; `npm install` writes the lockfile that pins them.

## package.json

Change `name`, `description` and the `bin` key. ESM (`"type": "module"`) is required by the imports below.

```json
{
  "name": "text-tools-mcp",
  "version": "0.1.0",
  "description": "Experimental example MCP server: word_count and convert_temperature over stdio.",
  "type": "module",
  "bin": {
    "text-tools-mcp": "dist/index.js"
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "node --import tsx --test test/*.test.ts",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.32.0",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "tsx": "^4.23.15",
    "typescript": "^5.9.3"
  },
  "license": "MIT"
}
```

`npm warn install-scripts … esbuild` from npm 11 is harmless here: tsx works without the postinstall.

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": false
  },
  "include": ["src"]
}
```

`module: Node16` means relative imports in `src/` carry a `.js` suffix (`./server.js`), even though
the file is `server.ts`. Forgetting it is the usual cause of `ERR_MODULE_NOT_FOUND` after a build.

## .gitignore

```
node_modules/
dist/
```

## src/server.ts

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const SERVER_NAME = "my-server";
export const SERVER_VERSION = "0.1.0";

// Dependencies that reach the outside world are parameters, so the tests can pass fakes.
export interface Deps {
  lookup: (id: string) => Promise<{ id: string; name: string } | undefined>;
}

export function createServer(deps: Deps = defaultDeps()): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    "get_thing",
    {
      title: "Get thing",
      description: "Look up one thing by id.",
      inputSchema: {
        id: z.string().min(1).describe("The thing's id."),
      },
      outputSchema: {
        id: z.string(),
        name: z.string(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const thing = await deps.lookup(id);
      if (!thing) {
        return { content: [{ type: "text", text: `No thing with id ${id}.` }], isError: true };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(thing) }],
        structuredContent: thing,
      };
    },
  );

  return server;
}

function defaultDeps(): Deps {
  return { lookup: async () => undefined };
}
```

`registerTool` is the current API; `server.tool(...)` is deprecated. `inputSchema` is a plain object
of zod types (a "raw shape"), not `z.object(...)`. When `outputSchema` is set, every successful
result must carry `structuredContent` that matches it, or the SDK returns an error.

## src/index.ts

```ts
#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, SERVER_NAME, SERVER_VERSION } from "./server.js";

const server = createServer();
await server.connect(new StdioServerTransport());
console.error(`${SERVER_NAME} ${SERVER_VERSION} running on stdio`);
```

Never `console.log` anywhere the server runs. Read credentials with `process.env.NAME` and fail at
startup with a `console.error` naming the missing variable.

## test/server.test.ts

`node:test` through tsx, so there is no test framework to install or configure.

```ts
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

const client = new Client({ name: "test-client", version: "0.0.0" });

before(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  // A fake in place of the real dependency: the tests never reach the outside world.
  const server = createServer({
    lookup: async (id) => (id === "a1" ? { id, name: "First" } : undefined),
  });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

after(async () => {
  await client.close();
});

describe("tools/list", () => {
  it("lists exactly the requested tools", async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), ["get_thing"]);
    for (const tool of tools) assert.equal(tool.inputSchema.type, "object");
  });
});

describe("get_thing", () => {
  it("returns the thing", async () => {
    const result = await client.callTool({ name: "get_thing", arguments: { id: "a1" } });
    assert.equal(result.isError, undefined);
    assert.deepEqual(result.structuredContent, { id: "a1", name: "First" });
  });

  it("reports an unknown id as a tool error", async () => {
    const result = await client.callTool({ name: "get_thing", arguments: { id: "missing" } });
    assert.equal(result.isError, true);
  });

  it("rejects arguments that do not match the schema", async () => {
    const result = await client.callTool({ name: "get_thing", arguments: {} });
    assert.equal(result.isError, true);
  });
});
```

`callTool` resolves, rather than throws, for a handler's `isError` result, for arguments the schema
refuses and for an unknown tool name; all three arrive as `isError: true`, so a test of a refusal
asserts `isError`, not a rejected promise.

## Mapping a tool list to zod

| The list says | zod |
| --- | --- |
| string / text | `z.string()` |
| non-empty string | `z.string().min(1)` |
| number | `z.number()` |
| integer, count, limit | `z.number().int()`, with `.min(0)` or `.positive()` when stated |
| boolean / flag | `z.boolean()` |
| one of A, B, C | `z.enum(["A", "B", "C"])` |
| list of X | `z.array(X)` |
| object with fields | `z.object({ ... })` |
| optional, defaults to D | `X.optional().default(D)` — or `.optional()` and handle absence |
| URL, email, ISO date | `z.string().url()`, `z.string().email()`, `z.string().datetime()` |

Every field gets `.describe("…")`: it is the text the client's model reads to decide what to pass.

## README.md template

Sections, in this order: title; one paragraph naming the tool list it was built from; a table of
tools (name, inputs, output, errors); environment variables, if any; build and test commands with
the `npm test` output pasted; client configuration; limitations and any reading of the list you had
to choose. Client blocks, with the name and absolute path changed:

Claude Code:

```
claude mcp add my-server -- node /absolute/path/to/my-server/dist/index.js
```

or `.mcp.json` at a project root:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/absolute/path/to/my-server/dist/index.js"],
      "env": { "MY_API_KEY": "..." }
    }
  }
}
```

Codex, `~/.codex/config.toml` (or `codex mcp add my-server -- node /absolute/path/to/my-server/dist/index.js`):

```toml
[mcp_servers.my-server]
command = "node"
args = ["/absolute/path/to/my-server/dist/index.js"]
env = { MY_API_KEY = "..." }
```

Claude Desktop, `claude_desktop_config.json`, and Cursor, `~/.cursor/mcp.json` or `.cursor/mcp.json`:
the same `mcpServers` object as `.mcp.json` above. VS Code, `.vscode/mcp.json`, uses `"servers"` in
place of `"mcpServers"` and adds `"type": "stdio"` to the entry.

Drop the `env` lines when the server needs no variables. Claude Desktop does not inherit the shell's
`PATH` on every platform; if `node` is not found, use its absolute path (`which node`).
