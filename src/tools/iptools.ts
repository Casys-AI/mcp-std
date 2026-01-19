/**
 * IP and Network calculation tools
 *
 * Pure Deno implementations - no external dependencies.
 * CIDR calculator, subnet operations, IP conversions.
 *
 * @module lib/std/iptools
 */

import type { MiniTool } from "./types.ts";

// Helper: Convert IP string to 32-bit number
function ipToNum(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

// Helper: Convert 32-bit number to IP string
function numToIp(num: number): string {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255,
  ].join(".");
}

// Helper: Create subnet mask from prefix length
function prefixToMask(prefix: number): number {
  if (prefix === 0) return 0;
  return (~0 << (32 - prefix)) >>> 0;
}


// Helper: Validate IPv4 address
function isValidIPv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    const num = parseInt(p, 10);
    return !isNaN(num) && num >= 0 && num <= 255 && String(num) === p;
  });
}

// Helper: Parse IPv6 to array of 8 16-bit values
function parseIPv6(ip: string): number[] | null {
  // Handle :: compression
  let parts = ip.split("::");
  if (parts.length > 2) return null;

  let left: string[] = [];
  let right: string[] = [];

  if (parts[0]) left = parts[0].split(":");
  if (parts[1]) right = parts[1].split(":");

  const totalParts = left.length + right.length;
  if (totalParts > 8) return null;

  const middle = Array(8 - totalParts).fill("0");
  const allParts = [...left, ...middle, ...right];

  if (allParts.length !== 8) return null;

  const values: number[] = [];
  for (const part of allParts) {
    if (!/^[0-9a-fA-F]{0,4}$/.test(part)) return null;
    values.push(parseInt(part || "0", 16));
  }

  return values;
}

export const iptoolsTools: MiniTool[] = [
  {
    name: "cidr_calculate",
    description:
      "Calculate subnet information from CIDR notation (e.g., 192.168.1.0/24). Returns network address, broadcast, usable range, host count, and wildcard mask. Essential for network planning. Keywords: CIDR calculator, subnet calculator, network address, broadcast address, IP range.",
    category: "network",
    inputSchema: {
      type: "object",
      properties: {
        cidr: { type: "string", description: "CIDR notation (e.g., 192.168.1.0/24)" },
      },
      required: ["cidr"],
    },
    handler: ({ cidr }) => {
      const [ipStr, prefixStr] = (cidr as string).split("/");
      if (!isValidIPv4(ipStr)) {
        return { error: "Invalid IPv4 address" };
      }

      const prefix = parseInt(prefixStr, 10);
      if (isNaN(prefix) || prefix < 0 || prefix > 32) {
        return { error: "Invalid prefix length (must be 0-32)" };
      }

      const ip = ipToNum(ipStr);
      const mask = prefixToMask(prefix);
      const wildcard = ~mask >>> 0;
      const network = (ip & mask) >>> 0;
      const broadcast = (network | wildcard) >>> 0;

      // Calculate usable hosts
      let firstUsable: number, lastUsable: number, usableHosts: number;
      if (prefix === 32) {
        firstUsable = lastUsable = network;
        usableHosts = 1;
      } else if (prefix === 31) {
        // Point-to-point link
        firstUsable = network;
        lastUsable = broadcast;
        usableHosts = 2;
      } else {
        firstUsable = network + 1;
        lastUsable = broadcast - 1;
        usableHosts = Math.pow(2, 32 - prefix) - 2;
      }

      // Determine class
      let ipClass: string;
      const firstOctet = (ip >>> 24) & 255;
      if (firstOctet < 128) ipClass = "A";
      else if (firstOctet < 192) ipClass = "B";
      else if (firstOctet < 224) ipClass = "C";
      else if (firstOctet < 240) ipClass = "D (Multicast)";
      else ipClass = "E (Reserved)";

      // Check if private
      const isPrivate =
        (firstOctet === 10) ||
        (firstOctet === 172 && ((ip >>> 16) & 255) >= 16 && ((ip >>> 16) & 255) <= 31) ||
        (firstOctet === 192 && ((ip >>> 16) & 255) === 168);

      return {
        cidr: `${numToIp(network)}/${prefix}`,
        network: numToIp(network),
        broadcast: numToIp(broadcast),
        netmask: numToIp(mask),
        wildcard: numToIp(wildcard),
        firstUsable: numToIp(firstUsable),
        lastUsable: numToIp(lastUsable),
        usableHosts,
        totalAddresses: Math.pow(2, 32 - prefix),
        prefix,
        ipClass,
        isPrivate,
      };
    },
  },
  {
    name: "cidr_contains",
    description:
      "Check if an IP address is within a CIDR range. Verify if an IP belongs to a subnet. Use for firewall rules, access control, or network validation. Keywords: IP in range, CIDR contains, subnet check, IP membership, network contains.",
    category: "network",
    inputSchema: {
      type: "object",
      properties: {
        cidr: { type: "string", description: "CIDR notation (e.g., 192.168.1.0/24)" },
        ip: { type: "string", description: "IP address to check" },
      },
      required: ["cidr", "ip"],
    },
    handler: ({ cidr, ip }) => {
      const [networkStr, prefixStr] = (cidr as string).split("/");
      if (!isValidIPv4(networkStr) || !isValidIPv4(ip as string)) {
        return { error: "Invalid IP address" };
      }

      const prefix = parseInt(prefixStr, 10);
      if (isNaN(prefix) || prefix < 0 || prefix > 32) {
        return { error: "Invalid prefix length" };
      }

      const mask = prefixToMask(prefix);
      const networkNum = ipToNum(networkStr) & mask;
      const ipNum = ipToNum(ip as string);

      const contains = (ipNum & mask) === networkNum;

      return {
        cidr,
        ip,
        contains,
        network: numToIp(networkNum),
        ipNetwork: numToIp(ipNum & mask),
      };
    },
  },
  {
    name: "subnet_divide",
    description:
      "Divide a network into smaller subnets. Split a CIDR block into N equal subnets or subnets of a specific size. Use for network planning and IP allocation. Keywords: subnet divide, split network, subnetting, divide CIDR, allocate subnets.",
    category: "network",
    inputSchema: {
      type: "object",
      properties: {
        cidr: { type: "string", description: "CIDR to divide (e.g., 10.0.0.0/16)" },
        count: { type: "number", description: "Number of subnets (must be power of 2)" },
        newPrefix: {
          type: "number",
          description: "Alternative: new prefix length (instead of count)",
        },
      },
      required: ["cidr"],
    },
    handler: ({ cidr, count, newPrefix }) => {
      const [networkStr, prefixStr] = (cidr as string).split("/");
      if (!isValidIPv4(networkStr)) {
        return { error: "Invalid network address" };
      }

      const prefix = parseInt(prefixStr, 10);
      if (isNaN(prefix) || prefix < 0 || prefix > 32) {
        return { error: "Invalid prefix length" };
      }

      let targetPrefix: number;
      if (newPrefix !== undefined) {
        targetPrefix = newPrefix as number;
        if (targetPrefix <= prefix || targetPrefix > 32) {
          return { error: "New prefix must be greater than current prefix and <= 32" };
        }
      } else if (count !== undefined) {
        const bitsNeeded = Math.ceil(Math.log2(count as number));
        targetPrefix = prefix + bitsNeeded;
        if (targetPrefix > 32) {
          return { error: `Cannot create ${count} subnets from /${prefix}` };
        }
      } else {
        return { error: "Provide either count or newPrefix" };
      }

      const mask = prefixToMask(prefix);
      const network = ipToNum(networkStr) & mask;
      const subnetCount = Math.pow(2, targetPrefix - prefix);
      const hostsPerSubnet = Math.pow(2, 32 - targetPrefix);

      const subnets: Array<{ cidr: string; network: string; broadcast: string; usable: number }> =
        [];
      for (let i = 0; i < subnetCount && subnets.length < 256; i++) {
        const subnetStart = network + i * hostsPerSubnet;
        const subnetEnd = subnetStart + hostsPerSubnet - 1;
        subnets.push({
          cidr: `${numToIp(subnetStart)}/${targetPrefix}`,
          network: numToIp(subnetStart),
          broadcast: numToIp(subnetEnd),
          usable: targetPrefix >= 31 ? hostsPerSubnet : hostsPerSubnet - 2,
        });
      }

      return {
        original: cidr,
        newPrefix: targetPrefix,
        subnetCount,
        hostsPerSubnet: targetPrefix >= 31 ? hostsPerSubnet : hostsPerSubnet - 2,
        subnets: subnets.length <= 256 ? subnets : subnets.slice(0, 256),
        truncated: subnetCount > 256,
      };
    },
  },
  {
    name: "ip_convert",
    description:
      "Convert IP address between different formats: dotted decimal, integer, binary, hexadecimal. Useful for debugging, firewall rules, and network programming. Keywords: IP convert, decimal to IP, IP to binary, IP to hex, IP formats.",
    category: "network",
    inputSchema: {
      type: "object",
      properties: {
        ip: { type: "string", description: "IP address or integer" },
        from: {
          type: "string",
          enum: ["dotted", "integer", "hex", "binary"],
          description: "Input format (auto-detected if not specified)",
        },
      },
      required: ["ip"],
    },
    handler: ({ ip, from }) => {
      let num: number;
      const input = (ip as string).trim();

      // Auto-detect or use specified format
      if (from === "integer" || (!from && /^\d+$/.test(input) && !input.includes("."))) {
        num = parseInt(input, 10);
        if (num < 0 || num > 0xffffffff) {
          return { error: "Integer out of range (0 to 4294967295)" };
        }
      } else if (from === "hex" || (!from && /^(0x)?[0-9a-fA-F]+$/.test(input))) {
        num = parseInt(input.replace(/^0x/, ""), 16);
        if (num < 0 || num > 0xffffffff) {
          return { error: "Hex value out of range" };
        }
      } else if (from === "binary" || (!from && /^[01.\s]+$/.test(input))) {
        const cleanBinary = input.replace(/[.\s]/g, "");
        if (cleanBinary.length !== 32) {
          return { error: "Binary must be 32 bits" };
        }
        num = parseInt(cleanBinary, 2);
      } else {
        if (!isValidIPv4(input)) {
          return { error: "Invalid IPv4 address" };
        }
        num = ipToNum(input);
      }

      // Generate all formats
      const dotted = numToIp(num);
      const binary = num.toString(2).padStart(32, "0");
      const binaryDotted = [
        binary.slice(0, 8),
        binary.slice(8, 16),
        binary.slice(16, 24),
        binary.slice(24, 32),
      ].join(".");

      return {
        dotted,
        integer: num,
        hex: "0x" + num.toString(16).padStart(8, "0"),
        binary: binaryDotted,
        binaryRaw: binary,
        octets: dotted.split(".").map(Number),
      };
    },
  },
  {
    name: "ipv6_expand",
    description:
      "Expand compressed IPv6 address to full form and vice versa. Handle :: compression, leading zeros. Convert between short and long IPv6 formats. Keywords: IPv6 expand, IPv6 compress, IPv6 full form, IPv6 short form, expand address.",
    category: "network",
    inputSchema: {
      type: "object",
      properties: {
        ipv6: { type: "string", description: "IPv6 address" },
        action: {
          type: "string",
          enum: ["expand", "compress"],
          description: "Action (default: expand)",
        },
      },
      required: ["ipv6"],
    },
    handler: ({ ipv6, action: _action = "expand" }) => {
      const input = (ipv6 as string).toLowerCase().trim();

      // Parse IPv6
      const values = parseIPv6(input);
      if (!values) {
        return { error: "Invalid IPv6 address" };
      }

      // Expanded form (always compute both)
      const expanded = values.map((v) => v.toString(16).padStart(4, "0")).join(":");

      // Compressed form
      const hexParts = values.map((v) => v.toString(16));

      // Find longest run of zeros
      let maxStart = -1, maxLen = 0, curStart = -1, curLen = 0;
      for (let i = 0; i < 8; i++) {
        if (values[i] === 0) {
          if (curStart === -1) curStart = i;
          curLen++;
          if (curLen > maxLen) {
            maxStart = curStart;
            maxLen = curLen;
          }
        } else {
          curStart = -1;
          curLen = 0;
        }
      }

      let compressed: string;
      if (maxLen >= 2) {
        const left = hexParts.slice(0, maxStart).join(":");
        const right = hexParts.slice(maxStart + maxLen).join(":");
        compressed = `${left}::${right}`;
        if (compressed === "::") compressed = "::";
        else if (compressed.startsWith(":::")) compressed = "::" + compressed.slice(3);
        else if (compressed.endsWith(":::")) compressed = compressed.slice(0, -3) + "::";
      } else {
        compressed = hexParts.join(":");
      }

      return {
        input,
        expanded,
        compressed,
        parts: values,
        isValid: true,
      };
    },
  },
  {
    name: "mac_format",
    description:
      "Format MAC address in different notations. Convert between colon, dash, dot, and plain formats. Normalize and validate MAC addresses. Keywords: MAC format, MAC address, format MAC, normalize MAC, EUI-48.",
    category: "network",
    inputSchema: {
      type: "object",
      properties: {
        mac: { type: "string", description: "MAC address in any format" },
        format: {
          type: "string",
          enum: ["colon", "dash", "dot", "plain"],
          description: "Output format (default: colon)",
        },
        uppercase: { type: "boolean", description: "Uppercase output (default: true)" },
      },
      required: ["mac"],
    },
    handler: ({ mac, format = "colon", uppercase = true }) => {
      // Extract hex digits
      const input = (mac as string).replace(/[^0-9a-fA-F]/g, "");
      if (input.length !== 12) {
        return { error: "Invalid MAC address (must be 12 hex digits)" };
      }

      // Split into bytes
      const bytes: string[] = [];
      for (let i = 0; i < 12; i += 2) {
        bytes.push(input.slice(i, i + 2));
      }

      let formatted: string;
      switch (format) {
        case "dash":
          formatted = bytes.join("-");
          break;
        case "dot":
          // Cisco format: 3 groups of 4 digits
          formatted = [
            input.slice(0, 4),
            input.slice(4, 8),
            input.slice(8, 12),
          ].join(".");
          break;
        case "plain":
          formatted = input;
          break;
        default:
          formatted = bytes.join(":");
      }

      if (uppercase) formatted = formatted.toUpperCase();
      else formatted = formatted.toLowerCase();

      // Extract OUI (first 3 bytes)
      const oui = bytes.slice(0, 3).join(":").toUpperCase();

      // Check properties
      const firstByte = parseInt(bytes[0], 16);
      const isMulticast = (firstByte & 0x01) === 1;
      const isLocal = (firstByte & 0x02) === 2;

      return {
        formatted,
        format,
        oui,
        isMulticast,
        isLocallyAdministered: isLocal,
        bytes: bytes.map((b) => parseInt(b, 16)),
      };
    },
  },
  {
    name: "ip_range",
    description:
      "Calculate IP range from start and end addresses. Get CIDR blocks that cover the range, total IPs, and validate the range. Keywords: IP range, address range, CIDR from range, IP block, range to CIDR.",
    category: "network",
    inputSchema: {
      type: "object",
      properties: {
        start: { type: "string", description: "Start IP address" },
        end: { type: "string", description: "End IP address" },
      },
      required: ["start", "end"],
    },
    handler: ({ start, end }) => {
      if (!isValidIPv4(start as string) || !isValidIPv4(end as string)) {
        return { error: "Invalid IP address" };
      }

      const startNum = ipToNum(start as string);
      const endNum = ipToNum(end as string);

      if (startNum > endNum) {
        return { error: "Start IP must be less than or equal to end IP" };
      }

      const totalIps = endNum - startNum + 1;

      // Find minimal CIDR blocks to cover the range
      const cidrs: string[] = [];
      let current = startNum;

      while (current <= endNum) {
        // Find the largest block that starts at current and doesn't exceed end
        let maxSize = 32;
        while (maxSize > 0) {
          const mask = prefixToMask(maxSize - 1);
          const blockStart = current & mask;
          const blockEnd = blockStart + Math.pow(2, 32 - (maxSize - 1)) - 1;

          if (blockStart === current && blockEnd <= endNum) {
            maxSize--;
          } else {
            break;
          }
        }

        cidrs.push(`${numToIp(current)}/${maxSize}`);
        current += Math.pow(2, 32 - maxSize);

        if (cidrs.length > 100) break; // Safety limit
      }

      return {
        start: start,
        end: end,
        totalIps,
        cidrs,
        cidrCount: cidrs.length,
      };
    },
  },
];
