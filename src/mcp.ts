/**
 * dupecheck MCP server. Tools: find_duplicate_dependencies.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys
 * not in this tool's defined spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schema as an explicit literal, and every
 * tools/call is validated by the core, which names the
 * offending path on invalid input.
 *
 * The check is pure local computation: no upstream API,
 * no authentication, no configuration.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { findDuplicateDependencies, formatPayload, VERSION } from "./dupecheck.js";

const TOOLS = [
  {
    name: "find_duplicate_dependencies",
    description:
      "Find duplicate dependencies in one tree: the same library installed at multiple versions, and different libraries that do the same job, with the wasted kilobytes for each.",
    inputSchema: {
      type: "object" as const,
      properties: {
        dependencies: {
          type: "array",
          description: "Installed dependencies in the tree (at least one)",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Package name" },
              version: { type: "string", description: "Installed version" },
              size_kb: {
                type: "number",
                description: "Installed size in kilobytes (optional; finite, >= 0)",
              },
            },
            required: ["name", "version"],
          },
        },
        aliases: {
          type: "array",
          description: "Groups of different library names that do the same job (optional)",
          items: {
            type: "object",
            properties: {
              canonical: {
                type: "string",
                description: "The library name to keep; must be one of the group's names",
              },
              names: {
                type: "array",
                description:
                  "Library names that do the same job (at least two; includes the canonical name)",
                minItems: 2,
                items: { type: "string" },
              },
            },
            required: ["canonical", "names"],
          },
        },
      },
      required: ["dependencies"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "dupecheck", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let out: unknown;
    if (name === "find_duplicate_dependencies") {
      const raw = (args ?? {}) as Record<string, unknown>;
      out = findDuplicateDependencies(raw.dependencies, raw.aliases);
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
