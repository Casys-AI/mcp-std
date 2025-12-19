/**
 * General utility tools
 *
 * Inspired by:
 * - IT-Tools MCP: https://github.com/wrenchpilot/it-tools-mcp
 *
 * @module lib/std/util
 */

import type { MiniTool } from "./types.ts";

// HTTP Status codes reference
const HTTP_STATUS: Record<number, { message: string; description: string; category: string }> = {
  // 1xx Informational
  100: { message: "Continue", description: "The server has received the request headers", category: "Informational" },
  101: { message: "Switching Protocols", description: "The server is switching protocols", category: "Informational" },
  102: { message: "Processing", description: "The server is processing the request", category: "Informational" },
  103: { message: "Early Hints", description: "Used to return some response headers before final response", category: "Informational" },
  // 2xx Success
  200: { message: "OK", description: "The request succeeded", category: "Success" },
  201: { message: "Created", description: "The request succeeded and a new resource was created", category: "Success" },
  202: { message: "Accepted", description: "The request has been accepted for processing", category: "Success" },
  203: { message: "Non-Authoritative Information", description: "The returned metadata is from a local or third-party copy", category: "Success" },
  204: { message: "No Content", description: "There is no content to send for this request", category: "Success" },
  205: { message: "Reset Content", description: "Tells the client to reset the document view", category: "Success" },
  206: { message: "Partial Content", description: "Only part of a resource is being delivered", category: "Success" },
  207: { message: "Multi-Status", description: "Conveys information about multiple resources", category: "Success" },
  208: { message: "Already Reported", description: "The members have already been enumerated", category: "Success" },
  226: { message: "IM Used", description: "The server has fulfilled a GET request for the resource", category: "Success" },
  // 3xx Redirection
  300: { message: "Multiple Choices", description: "The request has more than one possible response", category: "Redirection" },
  301: { message: "Moved Permanently", description: "The URL of the requested resource has been changed permanently", category: "Redirection" },
  302: { message: "Found", description: "The URI of requested resource has been changed temporarily", category: "Redirection" },
  303: { message: "See Other", description: "The server sent this response to direct the client to get the resource at another URI", category: "Redirection" },
  304: { message: "Not Modified", description: "The response has not been modified", category: "Redirection" },
  307: { message: "Temporary Redirect", description: "The server is redirecting to another URI with the same method", category: "Redirection" },
  308: { message: "Permanent Redirect", description: "The resource is now permanently located at another URI", category: "Redirection" },
  // 4xx Client Errors
  400: { message: "Bad Request", description: "The server cannot process the request due to client error", category: "Client Error" },
  401: { message: "Unauthorized", description: "Authentication is required", category: "Client Error" },
  402: { message: "Payment Required", description: "Reserved for future use", category: "Client Error" },
  403: { message: "Forbidden", description: "The client does not have access rights", category: "Client Error" },
  404: { message: "Not Found", description: "The server cannot find the requested resource", category: "Client Error" },
  405: { message: "Method Not Allowed", description: "The request method is not supported", category: "Client Error" },
  406: { message: "Not Acceptable", description: "No content matching the Accept headers", category: "Client Error" },
  407: { message: "Proxy Authentication Required", description: "Authentication with a proxy is required", category: "Client Error" },
  408: { message: "Request Timeout", description: "The server timed out waiting for the request", category: "Client Error" },
  409: { message: "Conflict", description: "The request conflicts with the current state", category: "Client Error" },
  410: { message: "Gone", description: "The content has been permanently deleted", category: "Client Error" },
  411: { message: "Length Required", description: "Content-Length header is required", category: "Client Error" },
  412: { message: "Precondition Failed", description: "A precondition in the headers was not met", category: "Client Error" },
  413: { message: "Payload Too Large", description: "The request entity is larger than the server will process", category: "Client Error" },
  414: { message: "URI Too Long", description: "The URI is longer than the server will interpret", category: "Client Error" },
  415: { message: "Unsupported Media Type", description: "The media format is not supported", category: "Client Error" },
  416: { message: "Range Not Satisfiable", description: "The range specified cannot be fulfilled", category: "Client Error" },
  417: { message: "Expectation Failed", description: "The expectation in the Expect header cannot be met", category: "Client Error" },
  418: { message: "I'm a teapot", description: "The server refuses to brew coffee because it is a teapot", category: "Client Error" },
  421: { message: "Misdirected Request", description: "The request was directed at a server unable to produce a response", category: "Client Error" },
  422: { message: "Unprocessable Entity", description: "The request was well-formed but had semantic errors", category: "Client Error" },
  423: { message: "Locked", description: "The resource is locked", category: "Client Error" },
  424: { message: "Failed Dependency", description: "The request failed due to failure of a previous request", category: "Client Error" },
  425: { message: "Too Early", description: "The server is unwilling to process a request that might be replayed", category: "Client Error" },
  426: { message: "Upgrade Required", description: "The client should switch to a different protocol", category: "Client Error" },
  428: { message: "Precondition Required", description: "The origin server requires the request to be conditional", category: "Client Error" },
  429: { message: "Too Many Requests", description: "The user has sent too many requests", category: "Client Error" },
  431: { message: "Request Header Fields Too Large", description: "The server is unwilling to process the request", category: "Client Error" },
  451: { message: "Unavailable For Legal Reasons", description: "The resource cannot be provided for legal reasons", category: "Client Error" },
  // 5xx Server Errors
  500: { message: "Internal Server Error", description: "The server encountered an unexpected condition", category: "Server Error" },
  501: { message: "Not Implemented", description: "The request method is not supported by the server", category: "Server Error" },
  502: { message: "Bad Gateway", description: "The server received an invalid response from an upstream server", category: "Server Error" },
  503: { message: "Service Unavailable", description: "The server is not ready to handle the request", category: "Server Error" },
  504: { message: "Gateway Timeout", description: "The server acting as a gateway did not get a response in time", category: "Server Error" },
  505: { message: "HTTP Version Not Supported", description: "The HTTP version used is not supported", category: "Server Error" },
  506: { message: "Variant Also Negotiates", description: "The server has an internal configuration error", category: "Server Error" },
  507: { message: "Insufficient Storage", description: "The server cannot store the representation", category: "Server Error" },
  508: { message: "Loop Detected", description: "The server detected an infinite loop", category: "Server Error" },
  510: { message: "Not Extended", description: "Further extensions are required for the server to fulfill the request", category: "Server Error" },
  511: { message: "Network Authentication Required", description: "The client needs to authenticate to gain network access", category: "Server Error" },
};

// Common MIME types
const MIME_TYPES: Record<string, { mime: string; description: string; binary: boolean }> = {
  // Text
  html: { mime: "text/html", description: "HTML document", binary: false },
  htm: { mime: "text/html", description: "HTML document", binary: false },
  css: { mime: "text/css", description: "CSS stylesheet", binary: false },
  js: { mime: "application/javascript", description: "JavaScript file", binary: false },
  mjs: { mime: "application/javascript", description: "JavaScript module", binary: false },
  json: { mime: "application/json", description: "JSON data", binary: false },
  xml: { mime: "application/xml", description: "XML document", binary: false },
  txt: { mime: "text/plain", description: "Plain text file", binary: false },
  csv: { mime: "text/csv", description: "CSV data", binary: false },
  md: { mime: "text/markdown", description: "Markdown document", binary: false },
  yaml: { mime: "application/x-yaml", description: "YAML document", binary: false },
  yml: { mime: "application/x-yaml", description: "YAML document", binary: false },
  // Images
  png: { mime: "image/png", description: "PNG image", binary: true },
  jpg: { mime: "image/jpeg", description: "JPEG image", binary: true },
  jpeg: { mime: "image/jpeg", description: "JPEG image", binary: true },
  gif: { mime: "image/gif", description: "GIF image", binary: true },
  webp: { mime: "image/webp", description: "WebP image", binary: true },
  svg: { mime: "image/svg+xml", description: "SVG vector image", binary: false },
  ico: { mime: "image/x-icon", description: "ICO icon", binary: true },
  avif: { mime: "image/avif", description: "AVIF image", binary: true },
  // Audio
  mp3: { mime: "audio/mpeg", description: "MP3 audio", binary: true },
  wav: { mime: "audio/wav", description: "WAV audio", binary: true },
  ogg: { mime: "audio/ogg", description: "OGG audio", binary: true },
  flac: { mime: "audio/flac", description: "FLAC audio", binary: true },
  // Video
  mp4: { mime: "video/mp4", description: "MP4 video", binary: true },
  webm: { mime: "video/webm", description: "WebM video", binary: true },
  avi: { mime: "video/x-msvideo", description: "AVI video", binary: true },
  mov: { mime: "video/quicktime", description: "QuickTime video", binary: true },
  // Documents
  pdf: { mime: "application/pdf", description: "PDF document", binary: true },
  doc: { mime: "application/msword", description: "Word document", binary: true },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", description: "Word document (OOXML)", binary: true },
  xls: { mime: "application/vnd.ms-excel", description: "Excel spreadsheet", binary: true },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", description: "Excel spreadsheet (OOXML)", binary: true },
  ppt: { mime: "application/vnd.ms-powerpoint", description: "PowerPoint presentation", binary: true },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", description: "PowerPoint presentation (OOXML)", binary: true },
  // Archives
  zip: { mime: "application/zip", description: "ZIP archive", binary: true },
  gz: { mime: "application/gzip", description: "Gzip archive", binary: true },
  tar: { mime: "application/x-tar", description: "TAR archive", binary: true },
  rar: { mime: "application/vnd.rar", description: "RAR archive", binary: true },
  "7z": { mime: "application/x-7z-compressed", description: "7-Zip archive", binary: true },
  // Fonts
  woff: { mime: "font/woff", description: "WOFF font", binary: true },
  woff2: { mime: "font/woff2", description: "WOFF2 font", binary: true },
  ttf: { mime: "font/ttf", description: "TrueType font", binary: true },
  otf: { mime: "font/otf", description: "OpenType font", binary: true },
  // Code
  ts: { mime: "application/typescript", description: "TypeScript file", binary: false },
  tsx: { mime: "application/typescript", description: "TypeScript React file", binary: false },
  jsx: { mime: "text/jsx", description: "JavaScript React file", binary: false },
  py: { mime: "text/x-python", description: "Python file", binary: false },
  rb: { mime: "text/x-ruby", description: "Ruby file", binary: false },
  go: { mime: "text/x-go", description: "Go file", binary: false },
  rs: { mime: "text/x-rust", description: "Rust file", binary: false },
  java: { mime: "text/x-java", description: "Java file", binary: false },
  sh: { mime: "application/x-sh", description: "Shell script", binary: false },
  // Other
  wasm: { mime: "application/wasm", description: "WebAssembly binary", binary: true },
};

export const utilTools: MiniTool[] = [
  {
    name: "util_http_status",
    description: "Look up HTTP status code information",
    category: "util",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "number", description: "HTTP status code (e.g., 200, 404, 500)" },
      },
      required: ["code"],
    },
    handler: ({ code }) => {
      const status = HTTP_STATUS[code as number];
      if (!status) {
        return {
          code,
          found: false,
          message: "Unknown status code",
          description: "This status code is not in the standard HTTP specification",
          category: "Unknown",
        };
      }
      return {
        code,
        found: true,
        ...status,
      };
    },
  },
  {
    name: "util_http_status_list",
    description: "List all HTTP status codes, optionally filtered by category",
    category: "util",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["Informational", "Success", "Redirection", "Client Error", "Server Error"],
          description: "Filter by category",
        },
      },
    },
    handler: ({ category }) => {
      const entries = Object.entries(HTTP_STATUS).map(([code, info]) => ({
        code: parseInt(code, 10),
        ...info,
      }));

      if (category) {
        return entries.filter((e) => e.category === category);
      }
      return entries;
    },
  },
  {
    name: "util_mime_type",
    description: "Look up MIME type by file extension",
    category: "util",
    inputSchema: {
      type: "object",
      properties: {
        extension: {
          type: "string",
          description: "File extension (e.g., 'json', 'png', 'pdf') without the dot",
        },
      },
      required: ["extension"],
    },
    handler: ({ extension }) => {
      const ext = (extension as string).toLowerCase().replace(/^\./, "");
      const info = MIME_TYPES[ext];
      if (!info) {
        return {
          extension: ext,
          found: false,
          mime: "application/octet-stream",
          description: "Unknown file type",
          binary: true,
        };
      }
      return {
        extension: ext,
        found: true,
        ...info,
      };
    },
  },
  {
    name: "util_mime_reverse",
    description: "Find file extensions for a MIME type",
    category: "util",
    inputSchema: {
      type: "object",
      properties: {
        mime: { type: "string", description: "MIME type (e.g., 'application/json')" },
      },
      required: ["mime"],
    },
    handler: ({ mime }) => {
      const mimeType = (mime as string).toLowerCase();
      const extensions = Object.entries(MIME_TYPES)
        .filter(([, info]) => info.mime === mimeType)
        .map(([ext, info]) => ({ extension: ext, ...info }));

      return {
        mime: mimeType,
        found: extensions.length > 0,
        extensions,
      };
    },
  },
  {
    name: "util_rem_px",
    description: "Convert between REM and PX units",
    category: "util",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "number", description: "Value to convert" },
        from: { type: "string", enum: ["rem", "px"], description: "Source unit" },
        baseFontSize: { type: "number", description: "Base font size in px (default: 16)" },
      },
      required: ["value", "from"],
    },
    handler: ({ value, from, baseFontSize = 16 }) => {
      const base = baseFontSize as number;
      const val = value as number;

      if (from === "rem") {
        const px = val * base;
        return { rem: val, px, baseFontSize: base };
      }
      const rem = val / base;
      return { px: val, rem, baseFontSize: base };
    },
  },
  {
    name: "util_format_css",
    description: "Format or minify CSS code",
    category: "util",
    inputSchema: {
      type: "object",
      properties: {
        css: { type: "string", description: "CSS code to format" },
        mode: {
          type: "string",
          enum: ["beautify", "minify"],
          description: "Format mode (default: beautify)",
        },
      },
      required: ["css"],
    },
    handler: ({ css, mode = "beautify" }) => {
      const input = css as string;

      if (mode === "minify") {
        // Simple CSS minification
        return input
          .replace(/\/\*[\s\S]*?\*\//g, "") // Remove comments
          .replace(/\s+/g, " ") // Collapse whitespace
          .replace(/\s*([{}:;,])\s*/g, "$1") // Remove space around punctuation
          .replace(/;}/g, "}") // Remove trailing semicolons
          .trim();
      }

      // Beautify CSS
      let result = input
        .replace(/\/\*[\s\S]*?\*\//g, (m) => `\n${m}\n`) // Preserve comments on own lines
        .replace(/\s*{\s*/g, " {\n  ") // Opening brace
        .replace(/\s*}\s*/g, "\n}\n\n") // Closing brace
        .replace(/;\s*/g, ";\n  ") // Semicolons
        .replace(/,\s*/g, ",\n") // Commas (selectors)
        .replace(/\n\s*\n/g, "\n") // Remove blank lines inside blocks
        .replace(/\n  }/g, "\n}") // Fix closing brace indentation
        .trim();

      // Clean up extra newlines
      result = result.replace(/\n{3,}/g, "\n\n");

      return result;
    },
  },
  {
    name: "util_normalize_email",
    description: "Normalize email address (lowercase, remove dots in gmail, etc.)",
    category: "util",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Email address to normalize" },
        removePlusTags: {
          type: "boolean",
          description: "Remove +tag portion (default: true)",
        },
        removeGmailDots: {
          type: "boolean",
          description: "Remove dots in Gmail addresses (default: true)",
        },
      },
      required: ["email"],
    },
    handler: ({ email, removePlusTags = true, removeGmailDots = true }) => {
      const original = email as string;
      const parts = original.toLowerCase().split("@");
      if (parts.length !== 2) {
        throw new Error(`Invalid email: ${email}`);
      }

      let [local, domain] = parts;

      // Remove +tag portion
      if (removePlusTags && local.includes("+")) {
        local = local.split("+")[0];
      }

      // Remove dots for Gmail addresses
      const gmailDomains = ["gmail.com", "googlemail.com"];
      if (removeGmailDots && gmailDomains.includes(domain)) {
        local = local.replace(/\./g, "");
        domain = "gmail.com"; // Normalize googlemail to gmail
      }

      const normalized = `${local}@${domain}`;

      return {
        original,
        normalized,
        local,
        domain,
        isGmail: gmailDomains.includes(domain),
      };
    },
  },
  {
    name: "util_port_numbers",
    description: "Look up common port numbers or find port by service name",
    category: "util",
    inputSchema: {
      type: "object",
      properties: {
        port: { type: "number", description: "Port number to look up" },
        service: { type: "string", description: "Service name to look up" },
        category: {
          type: "string",
          enum: ["web", "mail", "database", "file", "remote", "all"],
          description: "Filter by category (default: all)",
        },
      },
    },
    handler: ({ port, service, category }) => {
      // Common ports database
      const ports: Record<number, { service: string; description: string; category: string }> = {
        // Web
        80: { service: "HTTP", description: "Hypertext Transfer Protocol", category: "web" },
        443: { service: "HTTPS", description: "HTTP Secure", category: "web" },
        8080: { service: "HTTP-ALT", description: "Alternative HTTP port", category: "web" },
        8443: { service: "HTTPS-ALT", description: "Alternative HTTPS port", category: "web" },
        // Mail
        25: { service: "SMTP", description: "Simple Mail Transfer Protocol", category: "mail" },
        465: { service: "SMTPS", description: "SMTP Secure", category: "mail" },
        587: { service: "SMTP-SUBMIT", description: "SMTP Submission", category: "mail" },
        110: { service: "POP3", description: "Post Office Protocol v3", category: "mail" },
        995: { service: "POP3S", description: "POP3 Secure", category: "mail" },
        143: { service: "IMAP", description: "Internet Message Access Protocol", category: "mail" },
        993: { service: "IMAPS", description: "IMAP Secure", category: "mail" },
        // Database
        3306: { service: "MySQL", description: "MySQL Database", category: "database" },
        5432: { service: "PostgreSQL", description: "PostgreSQL Database", category: "database" },
        27017: { service: "MongoDB", description: "MongoDB Database", category: "database" },
        6379: { service: "Redis", description: "Redis Cache", category: "database" },
        1433: { service: "MSSQL", description: "Microsoft SQL Server", category: "database" },
        1521: { service: "Oracle", description: "Oracle Database", category: "database" },
        // File Transfer
        20: { service: "FTP-DATA", description: "FTP Data Transfer", category: "file" },
        21: { service: "FTP", description: "File Transfer Protocol", category: "file" },
        22: { service: "SSH/SFTP", description: "Secure Shell / SFTP", category: "file" },
        69: { service: "TFTP", description: "Trivial File Transfer Protocol", category: "file" },
        // Remote Access
        23: { service: "Telnet", description: "Telnet (insecure)", category: "remote" },
        3389: { service: "RDP", description: "Remote Desktop Protocol", category: "remote" },
        5900: { service: "VNC", description: "Virtual Network Computing", category: "remote" },
        // Other common
        53: { service: "DNS", description: "Domain Name System", category: "web" },
        67: { service: "DHCP-S", description: "DHCP Server", category: "web" },
        68: { service: "DHCP-C", description: "DHCP Client", category: "web" },
        123: { service: "NTP", description: "Network Time Protocol", category: "web" },
        161: { service: "SNMP", description: "Simple Network Management Protocol", category: "remote" },
        389: { service: "LDAP", description: "Lightweight Directory Access Protocol", category: "remote" },
        636: { service: "LDAPS", description: "LDAP Secure", category: "remote" },
        9200: { service: "Elasticsearch", description: "Elasticsearch HTTP", category: "database" },
        9300: { service: "Elasticsearch", description: "Elasticsearch Transport", category: "database" },
        5672: { service: "RabbitMQ", description: "RabbitMQ AMQP", category: "database" },
        15672: { service: "RabbitMQ", description: "RabbitMQ Management", category: "database" },
        2181: { service: "Zookeeper", description: "Apache Zookeeper", category: "database" },
        9092: { service: "Kafka", description: "Apache Kafka", category: "database" },
      };

      // Look up by port number
      if (port !== undefined) {
        const info = ports[port as number];
        if (info) {
          return { port, found: true, ...info };
        }
        return { port, found: false, service: "Unknown", description: "Port not in database" };
      }

      // Look up by service name
      if (service) {
        const svc = (service as string).toLowerCase();
        const matches = Object.entries(ports)
          .filter(([, info]) => info.service.toLowerCase().includes(svc))
          .map(([p, info]) => ({ port: parseInt(p, 10), ...info }));

        return { service, found: matches.length > 0, matches };
      }

      // List all or by category
      const cat = category as string | undefined;
      const entries = Object.entries(ports)
        .filter(([, info]) => !cat || cat === "all" || info.category === cat)
        .map(([p, info]) => ({ port: parseInt(p, 10), ...info }))
        .sort((a, b) => a.port - b.port);

      return { count: entries.length, ports: entries };
    },
  },
];
