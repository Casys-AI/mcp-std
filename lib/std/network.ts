/**
 * Network utility tools
 *
 * Inspired by:
 * - IT-Tools MCP: https://github.com/wrenchpilot/it-tools-mcp
 *
 * @module lib/std/network
 */

import type { MiniTool } from "./types.ts";

export const networkTools: MiniTool[] = [
  {
    name: "network_parse_url",
    description: "Parse a URL into its components",
    category: "network",
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
        const params: Record<string, string> = {};
        parsed.searchParams.forEach((value, key) => {
          params[key] = value;
        });

        return {
          href: parsed.href,
          protocol: parsed.protocol.replace(":", ""),
          host: parsed.host,
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === "https:" ? "443" : "80"),
          pathname: parsed.pathname,
          search: parsed.search,
          hash: parsed.hash,
          origin: parsed.origin,
          username: parsed.username || null,
          password: parsed.password || null,
          params,
        };
      } catch {
        throw new Error(`Invalid URL: ${url}`);
      }
    },
  },
  {
    name: "network_build_url",
    description: "Build a URL from components",
    category: "network",
    inputSchema: {
      type: "object",
      properties: {
        protocol: { type: "string", description: "Protocol (default: https)" },
        hostname: { type: "string", description: "Hostname" },
        port: { type: "number", description: "Port (optional)" },
        pathname: { type: "string", description: "Path (default: /)" },
        params: { type: "object", description: "Query parameters" },
        hash: { type: "string", description: "Hash/fragment" },
      },
      required: ["hostname"],
    },
    handler: ({ protocol = "https", hostname, port, pathname = "/", params, hash }) => {
      const url = new URL(`${protocol}://${hostname}`);
      if (port) url.port = String(port);
      url.pathname = pathname as string;
      if (params) {
        for (const [key, value] of Object.entries(params as Record<string, string>)) {
          url.searchParams.set(key, value);
        }
      }
      if (hash) url.hash = hash as string;
      return url.href;
    },
  },
  {
    name: "network_ip_info",
    description: "Parse and analyze an IPv4 address",
    category: "network",
    inputSchema: {
      type: "object",
      properties: {
        ip: { type: "string", description: "IPv4 address" },
      },
      required: ["ip"],
    },
    handler: ({ ip }) => {
      const parts = (ip as string).split(".").map(Number);
      if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
        throw new Error(`Invalid IPv4 address: ${ip}`);
      }

      const [a, b, c, d] = parts;
      const numeric = (a << 24) + (b << 16) + (c << 8) + d;
      const binary = parts.map((p) => p.toString(2).padStart(8, "0")).join(".");

      // Determine class
      let ipClass = "Unknown";
      let defaultMask = "";
      if (a >= 1 && a <= 126) {
        ipClass = "A";
        defaultMask = "255.0.0.0";
      } else if (a >= 128 && a <= 191) {
        ipClass = "B";
        defaultMask = "255.255.0.0";
      } else if (a >= 192 && a <= 223) {
        ipClass = "C";
        defaultMask = "255.255.255.0";
      } else if (a >= 224 && a <= 239) {
        ipClass = "D (Multicast)";
      } else if (a >= 240 && a <= 255) {
        ipClass = "E (Reserved)";
      }

      // Check if private
      const isPrivate =
        (a === 10) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 127);

      return {
        ip,
        binary,
        numeric: numeric >>> 0, // Convert to unsigned
        class: ipClass,
        defaultMask,
        isPrivate,
        isLoopback: a === 127,
      };
    },
  },
  {
    name: "network_subnet_calc",
    description: "Calculate subnet information from IP and CIDR",
    category: "network",
    inputSchema: {
      type: "object",
      properties: {
        cidr: {
          type: "string",
          description: "CIDR notation (e.g., '192.168.1.0/24')",
        },
      },
      required: ["cidr"],
    },
    handler: ({ cidr }) => {
      const [ip, maskBits] = (cidr as string).split("/");
      const mask = parseInt(maskBits, 10);

      if (mask < 0 || mask > 32) {
        throw new Error(`Invalid CIDR mask: /${maskBits}`);
      }

      const parts = ip.split(".").map(Number);
      if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
        throw new Error(`Invalid IP address: ${ip}`);
      }

      const ipNum = (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
      const maskNum = mask === 0 ? 0 : (~0 << (32 - mask)) >>> 0;
      const networkNum = (ipNum & maskNum) >>> 0;
      const broadcastNum = (networkNum | ~maskNum) >>> 0;
      const hostCount = Math.pow(2, 32 - mask) - 2;

      const numToIp = (n: number) =>
        [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");

      const maskToIp = (bits: number) => {
        const m = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
        return numToIp(m);
      };

      return {
        cidr,
        networkAddress: numToIp(networkNum),
        broadcastAddress: numToIp(broadcastNum),
        subnetMask: maskToIp(mask),
        wildcardMask: numToIp(~maskNum >>> 0),
        firstHost: mask < 31 ? numToIp(networkNum + 1) : numToIp(networkNum),
        lastHost: mask < 31 ? numToIp(broadcastNum - 1) : numToIp(broadcastNum),
        hostCount: Math.max(0, hostCount),
        totalAddresses: Math.pow(2, 32 - mask),
        maskBits: mask,
      };
    },
  },
  {
    name: "network_mac_format",
    description: "Format or validate a MAC address",
    category: "network",
    inputSchema: {
      type: "object",
      properties: {
        mac: { type: "string", description: "MAC address in any format" },
        format: {
          type: "string",
          enum: ["colon", "hyphen", "dot", "none"],
          description: "Output format (default: colon)",
        },
      },
      required: ["mac"],
    },
    handler: ({ mac, format = "colon" }) => {
      // Remove all separators and validate
      const clean = (mac as string).replace(/[:\-. ]/g, "").toUpperCase();
      if (!/^[0-9A-F]{12}$/.test(clean)) {
        throw new Error(`Invalid MAC address: ${mac}`);
      }

      const pairs = clean.match(/.{2}/g)!;

      let formatted: string;
      switch (format) {
        case "hyphen":
          formatted = pairs.join("-");
          break;
        case "dot":
          formatted = `${pairs[0]}${pairs[1]}.${pairs[2]}${pairs[3]}.${pairs[4]}${pairs[5]}`;
          break;
        case "none":
          formatted = clean;
          break;
        default:
          formatted = pairs.join(":");
      }

      // Determine vendor prefix (OUI)
      const oui = pairs.slice(0, 3).join(":");

      return {
        formatted,
        canonical: pairs.join(":"),
        oui,
        isUnicast: (parseInt(pairs[0], 16) & 1) === 0,
        isLocal: (parseInt(pairs[0], 16) & 2) !== 0,
      };
    },
  },
  {
    name: "network_fang_url",
    description: "Defang or refang URLs/IPs for safe sharing in threat intelligence",
    category: "network",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "URL, IP, or domain to defang/refang" },
        mode: {
          type: "string",
          enum: ["defang", "refang"],
          description: "Mode: defang (make safe) or refang (restore) (default: defang)",
        },
      },
      required: ["input"],
    },
    handler: ({ input, mode = "defang" }) => {
      const s = input as string;

      if (mode === "refang") {
        // Restore defanged URLs
        return s
          .replace(/\[:\]/g, ":")
          .replace(/\[\.\]/g, ".")
          .replace(/hxxp/gi, "http")
          .replace(/hXXp/gi, "http")
          .replace(/\[@\]/g, "@")
          .replace(/\[\/\]/g, "/");
      }

      // Defang: make URLs safe to share
      return s
        .replace(/\./g, "[.]")
        .replace(/:/g, "[:]")
        .replace(/http/gi, "hxxp")
        .replace(/@/g, "[@]");
    },
  },
];
