import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

// The real server and a real client, joined by an in-memory transport: every call below goes through
// the SDK's JSON-RPC handling and schema validation, with no child process.
const client = new Client({ name: "test-client", version: "0.0.0" });

before(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([createServer().connect(serverTransport), client.connect(clientTransport)]);
});

after(async () => {
  await client.close();
});

describe("tools/list", () => {
  it("lists exactly the requested tools, each with an object input schema", async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), ["convert_temperature", "word_count"]);
    for (const tool of tools) {
      assert.equal(tool.inputSchema.type, "object");
      assert.ok(tool.description);
    }
    const convert = tools.find((tool) => tool.name === "convert_temperature")!;
    assert.deepEqual([...(convert.inputSchema.required ?? [])].sort(), ["from", "to", "value"]);
  });
});

describe("word_count", () => {
  it("counts words, characters and lines", async () => {
    const result = await client.callTool({ name: "word_count", arguments: { text: "one two\nthree" } });
    assert.equal(result.isError, undefined);
    assert.deepEqual(result.structuredContent, { words: 3, characters: 13, lines: 2 });
  });

  it("returns zeros for empty text", async () => {
    const result = await client.callTool({ name: "word_count", arguments: { text: "" } });
    assert.deepEqual(result.structuredContent, { words: 0, characters: 0, lines: 0 });
  });

  it("rejects a missing argument", async () => {
    const result = await client.callTool({ name: "word_count", arguments: {} });
    assert.equal(result.isError, true);
  });
});

describe("convert_temperature", () => {
  it("converts celsius to fahrenheit", async () => {
    const result = await client.callTool({
      name: "convert_temperature",
      arguments: { value: 100, from: "celsius", to: "fahrenheit" },
    });
    assert.deepEqual(result.structuredContent, { value: 212, unit: "fahrenheit" });
  });

  it("converts fahrenheit to kelvin", async () => {
    const result = await client.callTool({
      name: "convert_temperature",
      arguments: { value: 32, from: "fahrenheit", to: "kelvin" },
    });
    assert.deepEqual(result.structuredContent, { value: 273.15, unit: "kelvin" });
  });

  it("reports a temperature below absolute zero as a tool error", async () => {
    const result = await client.callTool({
      name: "convert_temperature",
      arguments: { value: -300, from: "celsius", to: "kelvin" },
    });
    assert.equal(result.isError, true);
  });

  it("rejects a unit outside the enum", async () => {
    const result = await client.callTool({
      name: "convert_temperature",
      arguments: { value: 1, from: "rankine", to: "kelvin" },
    });
    assert.equal(result.isError, true);
  });
});
