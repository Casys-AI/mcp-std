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
  // SafeLink decoder - inspired by IT-Tools MCP
  {
    name: "network_decode_safelink",
    description: "Decode SafeLinks (URL wrappers from email security like Microsoft Defender, Proofpoint, Mimecast)",
    category: "network",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "SafeLink URL to decode",
        },
      },
      required: ["url"],
    },
    handler: ({ url }) => {
      const u = url as string;

      // Microsoft Defender SafeLinks
      // Format: https://eur02.safelinks.protection.outlook.com/?url=...&data=...
      if (u.includes("safelinks.protection.outlook.com")) {
        const urlObj = new URL(u);
        const encodedUrl = urlObj.searchParams.get("url");
        if (encodedUrl) {
          const decoded = decodeURIComponent(encodedUrl);
          return {
            type: "Microsoft Defender SafeLinks",
            original: u,
            decoded,
          };
        }
      }

      // Proofpoint URL Defense
      // Format: https://urldefense.proofpoint.com/v2/url?u=https-3A__example.com&d=...
      if (u.includes("urldefense.proofpoint.com") || u.includes("urldefense.com")) {
        const urlObj = new URL(u);
        let encodedUrl = urlObj.searchParams.get("u");
        if (encodedUrl) {
          // Proofpoint v2 encoding: -XX for special chars
          const decoded = encodedUrl
            .replace(/-2D/g, "-")
            .replace(/-3A/g, ":")
            .replace(/-2F/g, "/")
            .replace(/-3F/g, "?")
            .replace(/-3D/g, "=")
            .replace(/-26/g, "&")
            .replace(/-23/g, "#")
            .replace(/-25/g, "%")
            .replace(/__/g, "/")
            .replace(/_/g, "/");

          return {
            type: "Proofpoint URL Defense",
            original: u,
            decoded,
          };
        }
      }

      // Mimecast
      // Format: https://url.mimecast.com/s/...?domain=example.com
      if (u.includes("url.mimecast.com") || u.includes("protect-us.mimecast.com")) {
        // Mimecast doesn't easily expose the original URL in the wrapper
        // The domain is sometimes in a parameter
        const urlObj = new URL(u);
        const domain = urlObj.searchParams.get("domain");
        return {
          type: "Mimecast",
          original: u,
          domain: domain || "Unknown - Mimecast encoding is not reversible",
          note: "Mimecast SafeLinks cannot be fully decoded without API access",
        };
      }

      // Barracuda
      // Format: https://linkprotect.cudasvc.com/url?a=...
      if (u.includes("linkprotect.cudasvc.com")) {
        const urlObj = new URL(u);
        const encodedUrl = urlObj.searchParams.get("a");
        if (encodedUrl) {
          try {
            const decoded = atob(encodedUrl);
            return {
              type: "Barracuda Link Protection",
              original: u,
              decoded,
            };
          } catch {
            // Base64 decode failed
          }
        }
      }

      // Google redirect
      // Format: https://www.google.com/url?q=...&sa=...
      if (u.includes("google.com/url")) {
        const urlObj = new URL(u);
        const encodedUrl = urlObj.searchParams.get("q") || urlObj.searchParams.get("url");
        if (encodedUrl) {
          return {
            type: "Google Redirect",
            original: u,
            decoded: decodeURIComponent(encodedUrl),
          };
        }
      }

      // Generic URL parameter extraction
      // Try common parameter names
      try {
        const urlObj = new URL(u);
        const possibleParams = ["url", "u", "link", "target", "redirect", "goto", "dest", "destination"];

        for (const param of possibleParams) {
          const value = urlObj.searchParams.get(param);
          if (value && (value.startsWith("http") || value.includes("."))) {
            return {
              type: "Generic URL Wrapper",
              original: u,
              decoded: decodeURIComponent(value),
              parameterUsed: param,
            };
          }
        }
      } catch {
        // URL parsing failed
      }

      return {
        type: "Unknown",
        original: u,
        note: "Could not detect SafeLink format or extract original URL",
      };
    },
  },
  {
    name: "network_ipv6_info",
    description: "Parse and analyze an IPv6 address",
    category: "network",
    inputSchema: {
      type: "object",
      properties: {
        ip: { type: "string", description: "IPv6 address" },
      },
      required: ["ip"],
    },
    handler: ({ ip }) => {
      const original = ip as string;

      // Expand the IPv6 address
      let expanded = original.toLowerCase();

      // Handle :: expansion
      if (expanded.includes("::")) {
        const parts = expanded.split("::");
        const left = parts[0] ? parts[0].split(":") : [];
        const right = parts[1] ? parts[1].split(":") : [];
        const missing = 8 - left.length - right.length;
        const middle = Array(missing).fill("0000");
        expanded = [...left, ...middle, ...right].join(":");
      }

      // Pad each group to 4 digits
      const groups = expanded.split(":");
      if (groups.length !== 8) {
        throw new Error(`Invalid IPv6 address: ${ip}`);
      }

      const paddedGroups = groups.map((g) => g.padStart(4, "0"));
      const fullExpanded = paddedGroups.join(":");

      // Create compressed version
      let compressed = paddedGroups.map((g) => g.replace(/^0+/, "") || "0").join(":");

      // Find longest sequence of zeros for ::
      const zeroRuns: Array<{ start: number; length: number }> = [];
      let runStart = -1;
      let runLength = 0;

      paddedGroups.forEach((g, i) => {
        if (g === "0000") {
          if (runStart === -1) runStart = i;
          runLength++;
        } else {
          if (runLength > 1) {
            zeroRuns.push({ start: runStart, length: runLength });
          }
          runStart = -1;
          runLength = 0;
        }
      });
      if (runLength > 1) {
        zeroRuns.push({ start: runStart, length: runLength });
      }

      if (zeroRuns.length > 0) {
        const longest = zeroRuns.reduce((a, b) => (b.length > a.length ? b : a));
        const parts = compressed.split(":");
        const before = parts.slice(0, longest.start).join(":");
        const after = parts.slice(longest.start + longest.length).join(":");
        compressed = `${before}::${after}`;
        if (compressed.startsWith(":::")) compressed = "::" + compressed.slice(3);
        if (compressed.endsWith(":::")) compressed = compressed.slice(0, -3) + "::";
      }

      // Determine address type
      let type = "Global Unicast";
      const firstGroup = parseInt(paddedGroups[0], 16);

      if (fullExpanded === "0000:0000:0000:0000:0000:0000:0000:0001") {
        type = "Loopback (::1)";
      } else if (fullExpanded === "0000:0000:0000:0000:0000:0000:0000:0000") {
        type = "Unspecified (::)";
      } else if (paddedGroups[0].startsWith("fe8")) {
        type = "Link-Local";
      } else if (paddedGroups[0].startsWith("fc") || paddedGroups[0].startsWith("fd")) {
        type = "Unique Local (Private)";
      } else if (paddedGroups[0].startsWith("ff")) {
        type = "Multicast";
      } else if (firstGroup >= 0x2000 && firstGroup <= 0x3fff) {
        type = "Global Unicast";
      }

      return {
        original,
        expanded: fullExpanded,
        compressed,
        groups: paddedGroups,
        type,
        isLoopback: fullExpanded === "0000:0000:0000:0000:0000:0000:0000:0001",
        isPrivate: paddedGroups[0].startsWith("fc") || paddedGroups[0].startsWith("fd"),
        isLinkLocal: paddedGroups[0].startsWith("fe8"),
      };
    },
  },
  // MAC address generator - inspired by IT-Tools MCP
  {
    name: "network_generate_mac",
    description: "Generate random MAC address(es)",
    category: "network",
    inputSchema: {
      type: "object",
      properties: {
        count: { type: "number", description: "Number of MACs to generate (default: 1)" },
        prefix: { type: "string", description: "OUI prefix to use (e.g., '00:50:56' for VMware)" },
        format: {
          type: "string",
          enum: ["colon", "hyphen", "dot", "none"],
          description: "Output format (default: colon)",
        },
        unicast: { type: "boolean", description: "Ensure unicast bit is set (default: true)" },
        local: { type: "boolean", description: "Set locally-administered bit (default: true)" },
      },
    },
    handler: ({ count = 1, prefix, format = "colon", unicast = true, local = true }) => {
      const generateOne = (): string => {
        let bytes: number[];

        if (prefix) {
          // Use provided OUI prefix
          const prefixClean = (prefix as string).replace(/[:\-. ]/g, "").toUpperCase();
          const prefixBytes = prefixClean.match(/.{2}/g)?.map((b) => parseInt(b, 16)) || [];
          bytes = [...prefixBytes];

          // Generate remaining bytes
          while (bytes.length < 6) {
            bytes.push(Math.floor(Math.random() * 256));
          }
        } else {
          // Generate all 6 bytes
          bytes = Array.from({ length: 6 }, () => Math.floor(Math.random() * 256));

          // Adjust first byte for unicast/multicast and local/global bits
          if (unicast) {
            bytes[0] = bytes[0] & 0xfe; // Clear multicast bit (bit 0)
          }
          if (local) {
            bytes[0] = bytes[0] | 0x02; // Set locally-administered bit (bit 1)
          }
        }

        const hex = bytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase());

        switch (format) {
          case "hyphen":
            return hex.join("-");
          case "dot":
            return `${hex[0]}${hex[1]}.${hex[2]}${hex[3]}.${hex[4]}${hex[5]}`;
          case "none":
            return hex.join("");
          default:
            return hex.join(":");
        }
      };

      const n = Math.min(Math.max(1, count as number), 100);
      const macs = Array.from({ length: n }, generateOne);

      return n === 1 ? macs[0] : macs;
    },
  },
  // IPv6 ULA generator - inspired by IT-Tools MCP
  {
    name: "network_generate_ipv6_ula",
    description: "Generate random IPv6 Unique Local Address (ULA) prefix",
    category: "network",
    inputSchema: {
      type: "object",
      properties: {
        count: { type: "number", description: "Number of ULA prefixes to generate (default: 1)" },
        subnetId: { type: "string", description: "Subnet ID to use (hex, 0-ffff, default: random)" },
      },
    },
    handler: ({ count = 1, subnetId }) => {
      const generateOne = (): object => {
        // Generate 40-bit Global ID (random)
        const globalId = Array.from({ length: 5 }, () =>
          Math.floor(Math.random() * 256)
            .toString(16)
            .padStart(2, "0")
        ).join("");

        // Subnet ID (16-bit)
        const subnet = subnetId
          ? (subnetId as string).padStart(4, "0")
          : Math.floor(Math.random() * 65536)
              .toString(16)
              .padStart(4, "0");

        // Format: fd + global ID (40 bits = 10 hex) + subnet ID (16 bits = 4 hex)
        // Split into 4-char groups for IPv6 format
        const prefix = `fd${globalId}`;
        const formatted = `${prefix.slice(0, 4)}:${prefix.slice(4, 8)}:${prefix.slice(8, 12)}:${subnet}`;

        return {
          prefix: `${formatted}::/64`,
          fullPrefix: `${formatted}:0000:0000:0000:0000`,
          globalId: globalId,
          subnetId: subnet,
          firstAddress: `${formatted}::1`,
          lastAddress: `${formatted}:ffff:ffff:ffff:ffff`,
          addressCount: "18,446,744,073,709,551,616", // 2^64 addresses in /64
        };
      };

      const n = Math.min(Math.max(1, count as number), 100);
      const ulas = Array.from({ length: n }, generateOne);

      return n === 1 ? ulas[0] : ulas;
    },
  },
  // Random port generator - inspired by IT-Tools MCP
  {
    name: "network_random_port",
    description: "Generate random port number(s) in specified range",
    category: "network",
    inputSchema: {
      type: "object",
      properties: {
        count: { type: "number", description: "Number of ports to generate (default: 1)" },
        range: {
          type: "string",
          enum: ["all", "privileged", "registered", "dynamic", "user"],
          description: "Port range: all (1-65535), privileged (1-1023), registered (1024-49151), dynamic/user (49152-65535)",
        },
        min: { type: "number", description: "Minimum port (overrides range)" },
        max: { type: "number", description: "Maximum port (overrides range)" },
        exclude: {
          type: "array",
          items: { type: "number" },
          description: "Ports to exclude from selection",
        },
      },
    },
    handler: ({ count = 1, range = "dynamic", min, max, exclude = [] }) => {
      // Determine range bounds
      let minPort = 1;
      let maxPort = 65535;

      if (min !== undefined && max !== undefined) {
        minPort = min as number;
        maxPort = max as number;
      } else {
        switch (range) {
          case "privileged":
            minPort = 1;
            maxPort = 1023;
            break;
          case "registered":
            minPort = 1024;
            maxPort = 49151;
            break;
          case "dynamic":
          case "user":
            minPort = 49152;
            maxPort = 65535;
            break;
          case "all":
          default:
            minPort = 1;
            maxPort = 65535;
        }
      }

      // Validate bounds
      minPort = Math.max(1, Math.min(65535, minPort));
      maxPort = Math.max(1, Math.min(65535, maxPort));
      if (minPort > maxPort) [minPort, maxPort] = [maxPort, minPort];

      const excludeSet = new Set(exclude as number[]);

      const generateOne = (): number => {
        let port: number;
        let attempts = 0;
        do {
          port = Math.floor(Math.random() * (maxPort - minPort + 1)) + minPort;
          attempts++;
        } while (excludeSet.has(port) && attempts < 1000);
        return port;
      };

      const n = Math.min(Math.max(1, count as number), 100);
      const ports = Array.from({ length: n }, generateOne);

      // Provide port info for single result
      if (n === 1) {
        const port = ports[0];
        let type = "Dynamic/Private";
        if (port <= 1023) type = "Well-Known/Privileged";
        else if (port <= 49151) type = "Registered";

        return {
          port,
          type,
          range: `${minPort}-${maxPort}`,
        };
      }

      return ports;
    },
  },
];
