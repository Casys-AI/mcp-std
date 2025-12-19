/**
 * HTTP helper tools
 *
 * Uses native fetch API for HTTP operations.
 *
 * @module lib/std/http
 */

import type { MiniTool } from "./types.ts";

export const httpTools: MiniTool[] = [
  {
    name: "http_get",
    description: "Make HTTP GET request",
    category: "http",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to fetch" },
        headers: { type: "object", description: "Request headers" },
        responseType: {
          type: "string",
          enum: ["json", "text", "blob"],
          description: "Expected response type (default: json)",
        },
      },
      required: ["url"],
    },
    handler: async ({ url, headers, responseType = "json" }) => {
      try {
        const response = await fetch(url as string, {
          method: "GET",
          headers: headers as HeadersInit | undefined,
        });

        const result = {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          ok: response.ok,
          data: null as unknown,
        };

        switch (responseType) {
          case "text":
            result.data = await response.text();
            break;
          case "blob":
            result.data = `[Blob: ${(await response.blob()).size} bytes]`;
            break;
          default:
            result.data = await response.json();
        }
        return result;
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
  },
  {
    name: "http_post",
    description: "Make HTTP POST request",
    category: "http",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to post to" },
        body: { description: "Request body (will be JSON stringified if object)" },
        headers: { type: "object", description: "Request headers" },
        contentType: {
          type: "string",
          enum: ["json", "form", "text"],
          description: "Content type (default: json)",
        },
      },
      required: ["url"],
    },
    handler: async ({ url, body, headers = {}, contentType = "json" }) => {
      try {
        const hdrs = { ...(headers as Record<string, string>) };
        let bodyStr: string | undefined;

        switch (contentType) {
          case "form":
            hdrs["Content-Type"] = "application/x-www-form-urlencoded";
            bodyStr = new URLSearchParams(body as Record<string, string>).toString();
            break;
          case "text":
            hdrs["Content-Type"] = "text/plain";
            bodyStr = String(body);
            break;
          default:
            hdrs["Content-Type"] = "application/json";
            bodyStr = JSON.stringify(body);
        }

        const response = await fetch(url as string, {
          method: "POST",
          headers: hdrs,
          body: bodyStr,
        });

        return {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          data: await response.json().catch(() => response.text()),
        };
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
  },
  {
    name: "http_request",
    description: "Make arbitrary HTTP request",
    category: "http",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL" },
        method: {
          type: "string",
          enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
          description: "HTTP method",
        },
        headers: { type: "object", description: "Request headers" },
        body: { description: "Request body" },
      },
      required: ["url", "method"],
    },
    handler: async ({ url, method, headers, body }) => {
      try {
        const options: RequestInit = {
          method: method as string,
          headers: headers as HeadersInit | undefined,
        };

        if (body && method !== "GET" && method !== "HEAD") {
          options.body = typeof body === "string" ? body : JSON.stringify(body);
          if (typeof body !== "string") {
            options.headers = {
              ...options.headers,
              "Content-Type": "application/json",
            };
          }
        }

        const response = await fetch(url as string, options);
        const text = await response.text();
        let data: unknown = text;
        try {
          data = JSON.parse(text);
        } catch {
          // Keep as text
        }

        return {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          headers: Object.fromEntries(response.headers.entries()),
          data,
        };
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
  },
  {
    name: "http_build_url",
    description: "Build URL with query parameters",
    category: "http",
    inputSchema: {
      type: "object",
      properties: {
        baseUrl: { type: "string", description: "Base URL" },
        params: { type: "object", description: "Query parameters" },
      },
      required: ["baseUrl"],
    },
    handler: ({ baseUrl, params }) => {
      const url = new URL(baseUrl as string);
      if (params) {
        for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
          if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value));
          }
        }
      }
      return url.toString();
    },
  },
  {
    name: "http_parse_url",
    description: "Parse URL into components",
    category: "http",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to parse" },
      },
      required: ["url"],
    },
    handler: ({ url }) => {
      try {
        const parsed = new URL(url as string);
        return {
          href: parsed.href,
          protocol: parsed.protocol,
          host: parsed.host,
          hostname: parsed.hostname,
          port: parsed.port || null,
          pathname: parsed.pathname,
          search: parsed.search,
          hash: parsed.hash,
          params: Object.fromEntries(parsed.searchParams.entries()),
          origin: parsed.origin,
        };
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
  },
  {
    name: "http_encode_uri",
    description: "Encode/decode URI components",
    category: "http",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to encode/decode" },
        action: { type: "string", enum: ["encode", "decode"], description: "Action" },
        type: {
          type: "string",
          enum: ["component", "full"],
          description: "URI component or full URI (default: component)",
        },
      },
      required: ["text", "action"],
    },
    handler: ({ text, action, type = "component" }) => {
      const t = text as string;
      if (action === "encode") {
        return type === "full" ? encodeURI(t) : encodeURIComponent(t);
      }
      return type === "full" ? decodeURI(t) : decodeURIComponent(t);
    },
  },
];
