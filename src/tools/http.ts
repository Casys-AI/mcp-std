/**
 * HTTP helper tools
 *
 * Uses native fetch API for HTTP operations.
 *
 * @module lib/std/http
 */

import type { MiniTool } from "./types.ts";
import { runCommand } from "./common.ts";

export const httpTools: MiniTool[] = [
  {
    name: "http_get",
    description:
      "Make HTTP GET request to fetch data from a URL. Retrieve API responses, download web content, or check endpoints. Supports custom headers and response types (json, text, blob). Use for REST API calls, data fetching, or web scraping. Keywords: HTTP GET, fetch API, REST GET, download URL, API request, web fetch.",
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
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        emits: ["select", "copy"],
        accepts: ["expandPath"],
      },
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
    description:
      "Make HTTP POST request to send data to a server. Submit forms, create resources, or authenticate with APIs. Supports JSON, form-urlencoded, and plain text body formats. Use for REST API calls, form submissions, or data creation. Keywords: HTTP POST, send data, API post, submit form, create resource, REST POST.",
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
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        emits: ["select", "copy"],
        accepts: ["expandPath"],
      },
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
    description:
      "Make HTTP request with any method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS). Full control over request configuration including headers and body. Use for REST APIs, custom HTTP operations, or when GET/POST shortcuts are insufficient. Keywords: HTTP request, fetch, PUT PATCH DELETE, REST API, custom request, HTTP method.",
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
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        emits: ["select", "copy"],
        accepts: ["expandPath"],
      },
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
    description:
      "Build URL by combining base URL with query parameters. Construct API URLs dynamically, add search params, or prepare request URLs. Properly encodes parameter values. Use for URL construction, API calls with filters, or pagination. Keywords: build URL, query params, URL encode, add parameters, construct URL, querystring.",
    category: "http",
    inputSchema: {
      type: "object",
      properties: {
        baseUrl: { type: "string", description: "Base URL" },
        params: { type: "object", description: "Query parameters" },
      },
      required: ["baseUrl"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        emits: ["copy"],
        accepts: [],
      },
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
    description:
      "Parse URL into its components (protocol, host, port, path, query params, hash). Extract parts of a URL for analysis or manipulation. Use for URL validation, extracting domains, or parsing API endpoints. Keywords: parse URL, URL components, extract domain, URL parts, hostname, query params.",
    category: "http",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to parse" },
      },
      required: ["url"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        emits: ["copy"],
        accepts: [],
      },
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
    description:
      "Encode or decode URI components and full URIs. Handle special characters in URLs, prepare strings for URL inclusion, or decode URL-encoded text. Use for URL safety, encoding query values, or decoding received URLs. Keywords: URL encode, URI encode, encodeURIComponent, decode URL, percent encoding, escape URL.",
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
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        emits: ["copy"],
        accepts: [],
      },
    },
    handler: ({ text, action, type = "component" }) => {
      const t = text as string;
      if (action === "encode") {
        return type === "full" ? encodeURI(t) : encodeURIComponent(t);
      }
      return type === "full" ? decodeURI(t) : decodeURIComponent(t);
    },
  },
  {
    name: "http_headers",
    description:
      "Fetch only HTTP headers from a URL using HEAD request. Retrieve response headers without downloading the body. Check content-type, content-length, cache headers, CORS, or server info efficiently. Use for header inspection, resource metadata, or pre-flight checks. Keywords: HTTP headers, HEAD request, response headers, content-type, cache-control, CORS headers, server info.",
    category: "http",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to fetch headers from" },
      },
      required: ["url"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/headers-viewer",
        emits: ["copy"],
        accepts: [],
      },
    },
    handler: async ({ url }) => {
      try {
        const response = await fetch(url as string, {
          method: "HEAD",
        });

        return {
          url: url as string,
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          headers: Object.fromEntries(response.headers.entries()),
        };
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
  },
  {
    name: "http_timing",
    description:
      "Measure HTTP request timing phases (DNS, connect, TLS, TTFB, download). Returns detailed timing breakdown similar to Chrome DevTools Network panel. Use for performance analysis, latency debugging, identifying slow phases, or network diagnostics. Keywords: HTTP timing, request latency, TTFB, time to first byte, network performance, DNS lookup time, TLS handshake, connection timing, waterfall chart.",
    category: "http",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to measure timing for" },
        method: {
          type: "string",
          enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"],
          description: "HTTP method (default: GET)",
        },
        headers: {
          type: "object",
          description: "Request headers as key-value pairs",
        },
        body: {
          type: "string",
          description: "Request body (for POST, PUT, PATCH)",
        },
        timeout: {
          type: "number",
          description: "Timeout in seconds (default: 30)",
        },
        followRedirects: {
          type: "boolean",
          description: "Follow HTTP redirects (default: true)",
        },
      },
      required: ["url"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/waterfall-viewer",
        emits: ["select", "expand"],
        accepts: [],
      },
    },
    handler: async ({
      url,
      method = "GET",
      headers,
      body,
      timeout = 30,
      followRedirects = true,
    }) => {
      // curl -w format string for timing metrics (all times in seconds)
      // time_namelookup: DNS lookup complete
      // time_connect: TCP connection complete
      // time_appconnect: TLS handshake complete (0 for HTTP)
      // time_starttransfer: First byte received (TTFB)
      // time_total: Total transfer time
      const writeFormat =
        "dns:%{time_namelookup} connect:%{time_connect} tls:%{time_appconnect} ttfb:%{time_starttransfer} total:%{time_total} status:%{http_code}";

      const args = [
        "-s", // Silent mode
        "-o",
        "/dev/null", // Discard response body
        "-w",
        writeFormat, // Custom output format
      ];

      // HTTP method
      if (method !== "GET") {
        args.push("-X", method as string);
      }

      // Follow redirects
      if (followRedirects) {
        args.push("-L");
      }

      // Timeout
      args.push("--max-time", String(timeout));

      // Custom headers
      if (headers) {
        for (const [key, value] of Object.entries(headers as Record<string, string>)) {
          args.push("-H", `${key}: ${value}`);
        }
      }

      // Request body
      if (body && method !== "GET" && method !== "HEAD") {
        args.push("-d", body as string);
      }

      // URL
      args.push(url as string);

      const result = await runCommand("curl", args, {
        timeout: (timeout as number) * 1000 + 5000,
      });

      if (result.code !== 0) {
        throw new Error(`curl failed: ${result.stderr || "Unknown error"}`);
      }

      // Parse timing output: "dns:0.001 connect:0.002 tls:0.003 ttfb:0.004 total:0.005 status:200"
      const output = result.stdout.trim();
      const timings: Record<string, number> = {};

      const regex = /(\w+):([\d.]+)/g;
      let match;
      while ((match = regex.exec(output)) !== null) {
        timings[match[1]] = parseFloat(match[2]);
      }

      // Convert seconds to milliseconds and calculate phase durations
      const toMs = (s: number) => Math.round(s * 1000 * 100) / 100; // Round to 2 decimal places

      const dnsTime = timings.dns || 0;
      const connectTime = timings.connect || 0;
      const tlsTime = timings.tls || 0;
      const ttfbTime = timings.ttfb || 0;
      const totalTime = timings.total || 0;
      const statusCode = timings.status || 0;

      // Calculate individual phase durations (not cumulative)
      // DNS: from start to DNS lookup complete
      const dnsDuration = dnsTime;
      // Connect: from DNS complete to TCP connect complete
      const connectDuration = connectTime - dnsTime;
      // TLS: from TCP connect to TLS complete (0 for HTTP, or if already connected)
      const tlsDuration = tlsTime > connectTime ? tlsTime - connectTime : 0;
      // TTFB: from TLS/connect complete to first byte
      const ttfbStart = tlsTime > 0 ? tlsTime : connectTime;
      const ttfbDuration = ttfbTime - ttfbStart;
      // Download: from first byte to complete
      const downloadDuration = totalTime - ttfbTime;

      return {
        url: url as string,
        method: method as string,
        status: statusCode,
        totalTime: toMs(totalTime),
        phases: {
          dns: toMs(dnsDuration),
          connect: toMs(connectDuration),
          tls: toMs(tlsDuration),
          ttfb: toMs(ttfbDuration),
          download: toMs(downloadDuration),
        },
      };
    },
  },
  {
    name: "http_headers_parse",
    description:
      "Parse and analyze HTTP headers to extract security, caching, content, CORS, and authentication information. Provides security score based on best practices (HSTS, CSP, X-Frame-Options, etc.). Use for security audits, header analysis, or debugging HTTP responses. Keywords: HTTP headers, security headers, HSTS, CSP, Content-Security-Policy, X-Frame-Options, cache-control, CORS headers, Set-Cookie, parse headers.",
    category: "http",
    inputSchema: {
      type: "object",
      properties: {
        headers: {
          oneOf: [
            { type: "string" },
            { type: "object" },
          ],
          description: "HTTP headers as raw text (header: value per line) or as a key-value object",
        },
      },
      required: ["headers"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/headers-viewer",
        emits: ["select", "copy"],
        accepts: [],
      },
    },
    handler: ({ headers }) => {
      // Header category definitions
      const HEADER_CATEGORIES: Record<string, {
        category: "security" | "caching" | "content" | "cors" | "auth" | "other";
        description: string;
      }> = {
        // Security headers
        "strict-transport-security": { category: "security", description: "Enforces HTTPS connections (HSTS)" },
        "content-security-policy": { category: "security", description: "Controls allowed content sources (CSP)" },
        "content-security-policy-report-only": { category: "security", description: "CSP in report-only mode" },
        "x-frame-options": { category: "security", description: "Prevents clickjacking attacks" },
        "x-content-type-options": { category: "security", description: "Prevents MIME type sniffing" },
        "x-xss-protection": { category: "security", description: "Legacy XSS filter (deprecated)" },
        "x-permitted-cross-domain-policies": { category: "security", description: "Controls Flash/PDF cross-domain access" },
        "referrer-policy": { category: "security", description: "Controls Referer header behavior" },
        "permissions-policy": { category: "security", description: "Controls browser features access" },
        "feature-policy": { category: "security", description: "Legacy permissions policy" },
        "cross-origin-opener-policy": { category: "security", description: "Controls cross-origin window access" },
        "cross-origin-embedder-policy": { category: "security", description: "Controls cross-origin embedding" },
        "cross-origin-resource-policy": { category: "security", description: "Controls cross-origin resource sharing" },

        // Caching headers
        "cache-control": { category: "caching", description: "Caching directives for browsers and proxies" },
        "expires": { category: "caching", description: "Expiration date for cached content" },
        "etag": { category: "caching", description: "Resource version identifier for validation" },
        "last-modified": { category: "caching", description: "Last modification date for validation" },
        "age": { category: "caching", description: "Time in cache (seconds)" },
        "vary": { category: "caching", description: "Headers that affect cache key" },
        "pragma": { category: "caching", description: "Legacy HTTP/1.0 caching directive" },

        // Content headers
        "content-type": { category: "content", description: "Media type and charset of the body" },
        "content-length": { category: "content", description: "Size of the body in bytes" },
        "content-encoding": { category: "content", description: "Compression algorithm (gzip, br, etc.)" },
        "content-language": { category: "content", description: "Language of the content" },
        "content-disposition": { category: "content", description: "Attachment or inline display" },
        "content-range": { category: "content", description: "Partial content byte range" },
        "content-location": { category: "content", description: "Alternate location for returned data" },
        "transfer-encoding": { category: "content", description: "Encoding for safe transfer (chunked)" },

        // CORS headers
        "access-control-allow-origin": { category: "cors", description: "Allowed origins for CORS requests" },
        "access-control-allow-methods": { category: "cors", description: "Allowed HTTP methods for CORS" },
        "access-control-allow-headers": { category: "cors", description: "Allowed request headers for CORS" },
        "access-control-allow-credentials": { category: "cors", description: "Allow credentials in CORS requests" },
        "access-control-expose-headers": { category: "cors", description: "Headers exposed to CORS response" },
        "access-control-max-age": { category: "cors", description: "CORS preflight cache duration" },
        "access-control-request-method": { category: "cors", description: "Method for CORS preflight" },
        "access-control-request-headers": { category: "cors", description: "Headers for CORS preflight" },

        // Auth headers
        "authorization": { category: "auth", description: "Client authentication credentials" },
        "www-authenticate": { category: "auth", description: "Authentication method required by server" },
        "proxy-authenticate": { category: "auth", description: "Proxy authentication required" },
        "proxy-authorization": { category: "auth", description: "Proxy authentication credentials" },
        "set-cookie": { category: "auth", description: "Set HTTP cookie on client" },
        "cookie": { category: "auth", description: "Send cookies to server" },
      };

      // Parse headers into a normalized object
      const parseHeaders = (input: unknown): Record<string, string> => {
        if (typeof input === "string") {
          const result: Record<string, string> = {};
          const lines = input.split(/\r?\n/);
          for (const line of lines) {
            const colonIndex = line.indexOf(":");
            if (colonIndex > 0) {
              const name = line.substring(0, colonIndex).trim().toLowerCase();
              const value = line.substring(colonIndex + 1).trim();
              result[name] = value;
            }
          }
          return result;
        } else if (typeof input === "object" && input !== null) {
          const result: Record<string, string> = {};
          for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
            result[key.toLowerCase()] = String(value);
          }
          return result;
        }
        return {};
      };

      const parsedHeaders = parseHeaders(headers);

      // Build categorized headers array
      const categorizedHeaders: Array<{
        name: string;
        value: string;
        category: "security" | "caching" | "content" | "cors" | "auth" | "other";
        description: string;
      }> = [];

      for (const [name, value] of Object.entries(parsedHeaders)) {
        const lowerName = name.toLowerCase();
        const info = HEADER_CATEGORIES[lowerName];

        if (info) {
          categorizedHeaders.push({
            name,
            value,
            category: info.category,
            description: info.description,
          });
        } else {
          // Categorize unknown headers
          let category: "security" | "caching" | "content" | "cors" | "auth" | "other" = "other";
          let description = "Custom or server-specific header";

          if (lowerName.startsWith("x-")) {
            description = "Custom extension header";
          } else if (lowerName.startsWith("access-control-")) {
            category = "cors";
            description = "CORS-related header";
          }

          categorizedHeaders.push({ name, value, category, description });
        }
      }

      // Calculate security score
      const hasHSTS = "strict-transport-security" in parsedHeaders;
      const hasCSP = "content-security-policy" in parsedHeaders ||
                     "content-security-policy-report-only" in parsedHeaders;
      const hasXFrameOptions = "x-frame-options" in parsedHeaders;
      const hasXContentType = "x-content-type-options" in parsedHeaders;
      const hasReferrerPolicy = "referrer-policy" in parsedHeaders;
      const hasPermissionsPolicy = "permissions-policy" in parsedHeaders ||
                                    "feature-policy" in parsedHeaders;

      // Score: Each key security header contributes points
      let securityScore = 0;
      if (hasHSTS) securityScore += 25; // HSTS is critical
      if (hasCSP) securityScore += 25; // CSP is critical
      if (hasXFrameOptions) securityScore += 15; // Clickjacking protection
      if (hasXContentType) securityScore += 15; // MIME sniffing protection
      if (hasReferrerPolicy) securityScore += 10; // Privacy improvement
      if (hasPermissionsPolicy) securityScore += 10; // Feature control

      // Parse caching info
      const cacheControl = parsedHeaders["cache-control"] || undefined;
      let maxAge: number | undefined;
      let isPublic = false;
      let isPrivate = false;

      if (cacheControl) {
        const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
        if (maxAgeMatch) {
          maxAge = parseInt(maxAgeMatch[1], 10);
        }
        isPublic = /\bpublic\b/.test(cacheControl);
        isPrivate = /\bprivate\b/.test(cacheControl);
      }

      // Parse content info
      const contentType = parsedHeaders["content-type"] || undefined;
      const contentLengthStr = parsedHeaders["content-length"];
      const contentLength = contentLengthStr ? parseInt(contentLengthStr, 10) : undefined;

      // Extract cookies
      const cookies: string[] = [];
      const setCookie = parsedHeaders["set-cookie"];
      if (setCookie) {
        // Set-Cookie can have multiple values, but when parsed as object it's usually one string
        // In raw format, there could be multiple Set-Cookie lines
        cookies.push(setCookie);
      }

      return {
        headers: categorizedHeaders,
        security: {
          hasHSTS,
          hasCSP,
          hasXFrameOptions,
          hasXContentType,
          score: securityScore,
        },
        caching: {
          cacheControl,
          maxAge,
          isPublic,
          isPrivate,
        },
        contentType,
        contentLength,
        cookies,
      };
    },
  },
];
