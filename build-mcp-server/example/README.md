# text-tools-mcp

> **Experimental, commissioned as a test of the IMD swarm. It may not work as described. Read the code, start with small amounts, no warranty.**

A worked example of what the `build-mcp-server` skill produces: a Model Context Protocol server in
TypeScript, over stdio, on `@modelcontextprotocol/sdk`, built from this tool list:

> Two tools. `word_count` takes `text` and returns words, characters and lines.
> `convert_temperature` takes `value`, `from` and `to` (celsius, fahrenheit or kelvin) and returns the
> converted value; a temperature below absolute zero is an error.

## Tools

| Tool | Input | Output | Errors |
| --- | --- | --- | --- |
| `word_count` | `text`: string | `words`, `characters`, `lines`: integers | missing `text` |
| `convert_temperature` | `value`: number; `from`, `to`: `celsius` \| `fahrenheit` \| `kelvin` | `value`: number, `unit` | below absolute zero; unit outside the enum |

Both are read-only and touch nothing outside the process.

## Layout

| Path | What it is |
| --- | --- |
| `src/server.ts` | `createServer()`: every tool registered with a zod input and output schema, no transport |
| `src/index.ts` | The stdio entry point; `--help` prints usage and the experimental notice |
| `test/server.test.ts` | One `describe` per tool, run against an in-process `Client` over `InMemoryTransport` |
| `package.json`, `package-lock.json`, `tsconfig.json` | Dependencies pinned by the lockfile; `npm run build` compiles `src/` to `dist/` |

## Build and test

Node 20 or later.

```
npm install
npm test
npm run build
node dist/index.js --help
```

`npm test` at the time of delivery:

```
▶ tools/list
  ✔ lists exactly the requested tools, each with an object input schema
▶ word_count
  ✔ counts words, characters and lines
  ✔ returns zeros for empty text
  ✔ rejects a missing argument
▶ convert_temperature
  ✔ converts celsius to fahrenheit
  ✔ converts fahrenheit to kelvin
  ✔ reports a temperature below absolute zero as a tool error
  ✔ rejects a unit outside the enum
ℹ tests 8
ℹ pass 8
ℹ fail 0
```

## Client configuration

Build first, then point the client at the absolute path of `dist/index.js`. Replace
`/absolute/path/to/text-tools-mcp` below with where you cloned it.

**Claude Code**

```
claude mcp add text-tools -- node /absolute/path/to/text-tools-mcp/dist/index.js
```

or, shared with a project, in `.mcp.json` at its root:

```json
{
  "mcpServers": {
    "text-tools": {
      "command": "node",
      "args": ["/absolute/path/to/text-tools-mcp/dist/index.js"]
    }
  }
}
```

**Codex** — `~/.codex/config.toml` (or `codex mcp add text-tools -- node /absolute/path/to/text-tools-mcp/dist/index.js`):

```toml
[mcp_servers.text-tools]
command = "node"
args = ["/absolute/path/to/text-tools-mcp/dist/index.js"]
```

**Claude Desktop** — `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "text-tools": {
      "command": "node",
      "args": ["/absolute/path/to/text-tools-mcp/dist/index.js"]
    }
  }
}
```

**Cursor** — `~/.cursor/mcp.json`, or `.cursor/mcp.json` in a project:

```json
{
  "mcpServers": {
    "text-tools": {
      "command": "node",
      "args": ["/absolute/path/to/text-tools-mcp/dist/index.js"]
    }
  }
}
```

**VS Code** — `.vscode/mcp.json`:

```json
{
  "servers": {
    "text-tools": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/text-tools-mcp/dist/index.js"]
    }
  }
}
```

## Limitations

- The tests run the server in-process; they do not start `dist/index.js` as a child process. The
  stdio path was checked by hand once, by piping an `initialize` and a `tools/call` into it.
- A delivered server also carries a `.gitignore` listing `node_modules/` and `dist/`. It is absent
  from this copy only because the path budget this example was delivered under did not admit
  dotfiles; `node_modules/` and `dist/` are not committed here either.
