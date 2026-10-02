import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const SERVER_NAME = "text-tools";
export const SERVER_VERSION = "0.1.0";

/**
 * Builds the server with every tool registered and no transport attached, so the stdio entry point
 * and the in-process tests run exactly the same tools.
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    "word_count",
    {
      title: "Word count",
      description: "Count the words, characters and lines in a piece of text.",
      inputSchema: {
        text: z.string().describe("The text to count."),
      },
      outputSchema: {
        words: z.number().int(),
        characters: z.number().int(),
        lines: z.number().int(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ text }) => {
      const result = {
        words: text.trim() === "" ? 0 : text.trim().split(/\s+/).length,
        characters: [...text].length,
        lines: text === "" ? 0 : text.split(/\r\n|\r|\n/).length,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "convert_temperature",
    {
      title: "Convert temperature",
      description: "Convert a temperature between celsius, fahrenheit and kelvin.",
      inputSchema: {
        value: z.number().describe("The temperature to convert."),
        from: z.enum(["celsius", "fahrenheit", "kelvin"]).describe("Unit of value."),
        to: z.enum(["celsius", "fahrenheit", "kelvin"]).describe("Unit to convert to."),
      },
      outputSchema: {
        value: z.number(),
        unit: z.enum(["celsius", "fahrenheit", "kelvin"]),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ value, from, to }) => {
      const kelvin = from === "kelvin" ? value : from === "celsius" ? value + 273.15 : ((value - 32) * 5) / 9 + 273.15;
      if (kelvin < 0) {
        // A domain error is a tool result the model can read and correct, not a protocol error.
        return {
          content: [{ type: "text", text: `${value} ${from} is below absolute zero.` }],
          isError: true,
        };
      }
      const converted = to === "kelvin" ? kelvin : to === "celsius" ? kelvin - 273.15 : ((kelvin - 273.15) * 9) / 5 + 32;
      const result = { value: Math.round(converted * 1e6) / 1e6, unit: to };
      return {
        content: [{ type: "text", text: `${result.value} ${to}` }],
        structuredContent: result,
      };
    },
  );

  return server;
}
