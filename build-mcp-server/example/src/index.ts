#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, SERVER_NAME, SERVER_VERSION } from "./server.js";

const EXPERIMENTAL =
  "Experimental, commissioned as a test of the IMD swarm. It may not work as described. Read the code, start with small amounts, no warranty.";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  // --help is the one path that writes to stdout: in normal operation stdout carries only protocol frames.
  process.stdout.write(
    `${SERVER_NAME} ${SERVER_VERSION}\n${EXPERIMENTAL}\n\n` +
      "An MCP server over stdio. Start it from an MCP client, not by hand.\n\n" +
      "Usage: node dist/index.js\n\n" +
      "Tools:\n" +
      "  word_count           count words, characters and lines in text\n" +
      "  convert_temperature  convert between celsius, fahrenheit and kelvin\n",
  );
  process.exit(0);
}

const server = createServer();
await server.connect(new StdioServerTransport());
// Logs go to stderr; anything written to stdout would corrupt the JSON-RPC stream.
console.error(`${SERVER_NAME} ${SERVER_VERSION} running on stdio`);
