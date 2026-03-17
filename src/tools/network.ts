/**
 * Network tools - HTTP, DNS, connectivity
 *
 * @module lib/std/tools/network
 */

import { type MiniTool, runCommand } from "./common.ts";

export const networkTools: MiniTool[] = [
  {
    name: "curl_fetch",
    description:
      "Make HTTP request using curl for API calls, web scraping, and testing endpoints. Supports all HTTP methods, custom headers, request bodies, and SSL options. Use for REST API interactions, webhook testing, file downloads, or HTTP debugging. Keywords: HTTP request, API call, REST client, web fetch, curl command, HTTP GET POST.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to fetch" },
        method: {
          type: "string",
          enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"],
          description: "HTTP method",
        },
        headers: { type: "object", description: "Request headers" },
        data: { type: "string", description: "Request body" },
        timeout: { type: "number", description: "Timeout in seconds (default: 30)" },
        followRedirects: { type: "boolean", description: "Follow redirects (default: true)" },
        insecure: { type: "boolean", description: "Allow insecure SSL connections" },
      },
      required: ["url"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        emits: ["copy", "expand"],
        accepts: [],
      },
    },
    handler: async (
      {
        url,
        method = "GET",
        headers,
        data,
        timeout = 30,
        followRedirects = true,
        insecure = false,
      },
    ) => {
      const args = ["-s", "-w", "\n%{http_code}\n%{time_total}"];

      if (method !== "GET") args.push("-X", method as string);
      if (followRedirects) args.push("-L");
      if (insecure) args.push("-k");
      args.push("--max-time", String(timeout));

      if (headers) {
        for (const [key, value] of Object.entries(headers as Record<string, string>)) {
          args.push("-H", `${key}: ${value}`);
        }
      }

      if (data) {
        args.push("-d", data as string);
      }

      args.push(url as string);

      const result = await runCommand("curl", args, { timeout: (timeout as number) * 1000 + 5000 });

      const lines = result.stdout.trim().split("\n");
      const timeTotal = parseFloat(lines.pop() || "0");
      const statusCode = parseInt(lines.pop() || "0", 10);
      const body = lines.join("\n");

      return {
        statusCode,
        body,
        timeMs: Math.round(timeTotal * 1000),
        success: statusCode >= 200 && statusCode < 300,
      };
    },
  },
  {
    name: "dig_lookup",
    description:
      "Perform DNS lookup to resolve domain names to IP addresses. Query A, AAAA, MX, NS, TXT, CNAME, and SOA records from any DNS server. Use for DNS debugging, verifying records, checking propagation, or troubleshooting domain issues. Keywords: DNS query, domain lookup, name resolution, dig command, DNS records, MX lookup.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Domain to lookup" },
        type: {
          type: "string",
          enum: ["A", "AAAA", "MX", "NS", "TXT", "CNAME", "SOA", "ANY"],
          description: "Record type (default: A)",
        },
        server: { type: "string", description: "DNS server to use (e.g., 8.8.8.8)" },
        short: { type: "boolean", description: "Short output (answers only)" },
      },
      required: ["domain"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: ["select", "copy"],
        accepts: ["highlight"],
      },
    },
    handler: async ({ domain, type = "A", server, short = true }) => {
      const args = [];
      if (server) args.push(`@${server}`);
      args.push(domain as string, type as string);
      if (short) args.push("+short");

      const result = await runCommand("dig", args);
      if (result.code !== 0) {
        throw new Error(`dig failed: ${result.stderr}`);
      }

      if (short) {
        const records = result.stdout.trim().split("\n").filter(Boolean);
        return { domain, type, records, count: records.length };
      }
      return { output: result.stdout };
    },
  },
  {
    name: "dns_lookup",
    description:
      "Perform structured DNS lookup returning parsed records with TTL, type, and value. Query A, AAAA, MX, TXT, CNAME, NS, or SOA records from any DNS server. Returns parsed record objects for programmatic use. Use for DNS automation, record verification, or when you need structured DNS data. Keywords: DNS lookup, structured DNS, parsed records, TTL, DNS automation, domain records.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Domain to resolve" },
        type: {
          type: "string",
          enum: ["A", "AAAA", "MX", "TXT", "CNAME", "NS", "SOA"],
          description: "Type of DNS record (default: A)",
        },
        server: { type: "string", description: "DNS server to use (e.g., 8.8.8.8, 1.1.1.1)" },
      },
      required: ["domain"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: ["select", "copy"],
        accepts: ["highlight"],
      },
    },
    handler: async ({ domain, type = "A", server }) => {
      const domainStr = domain as string;
      const typeStr = type as string;
      const serverStr = server as string | undefined;

      // Build dig command with +noall +answer for structured output
      const args: string[] = [];
      if (serverStr) args.push(`@${serverStr}`);
      args.push(domainStr, typeStr, "+noall", "+answer");

      const result = await runCommand("dig", args);
      if (result.code !== 0) {
        throw new Error(`DNS lookup failed: ${result.stderr}`);
      }

      // Parse dig answer section output
      // Format: name TTL class type value
      // Example: example.com. 300 IN A 93.184.216.34
      const lines = result.stdout.trim().split("\n").filter(Boolean);
      const records: Array<{ name: string; ttl: number; type: string; value: string }> = [];

      for (const line of lines) {
        // Skip comment lines
        if (line.startsWith(";")) continue;

        // Split by whitespace, but handle TXT records which may have spaces in quotes
        const parts = line.split(/\s+/);
        if (parts.length >= 5) {
          const name = parts[0].replace(/\.$/, ""); // Remove trailing dot
          const ttl = parseInt(parts[1], 10);
          // parts[2] is class (IN)
          const recordType = parts[3];
          // Value is everything after the type (handles multi-part values like MX priority or TXT strings)
          const value = parts.slice(4).join(" ").replace(/^"|"$/g, "");

          records.push({
            name,
            ttl,
            type: recordType,
            value,
          });
        }
      }

      return {
        domain: domainStr,
        type: typeStr,
        records,
        server: serverStr,
      };
    },
  },
  {
    name: "ping_host",
    description:
      "Ping a host using ICMP to check network connectivity and measure latency. Returns round-trip time (RTT) statistics, packet loss percentage, and reachability status. Use for network diagnostics, uptime monitoring, troubleshooting connectivity, or testing host availability. Keywords: ping test, network connectivity, latency check, host reachable, ICMP echo, network diagnostics.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Host to ping" },
        count: { type: "number", description: "Number of pings (default: 4)" },
        timeout: { type: "number", description: "Timeout per ping in seconds (default: 5)" },
      },
      required: ["host"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/status-badge",
        emits: ["click"],
        accepts: [],
      },
    },
    handler: async ({ host, count = 4, timeout = 5 }) => {
      const args = ["-c", String(count), "-W", String(timeout), host as string];

      const result = await runCommand("ping", args, {
        timeout: (count as number) * (timeout as number) * 1000 + 5000,
      });

      const lines = result.stdout.split("\n");
      const statsLine = lines.find((l) => l.includes("packets transmitted"));
      const rttLine = lines.find((l) => l.includes("rtt") || l.includes("round-trip"));

      let transmitted = 0, received = 0, loss = 0;
      if (statsLine) {
        const match = statsLine.match(
          /(\d+) packets transmitted, (\d+) (?:packets )?received, (\d+(?:\.\d+)?)% packet loss/,
        );
        if (match) {
          transmitted = parseInt(match[1], 10);
          received = parseInt(match[2], 10);
          loss = parseFloat(match[3]);
        }
      }

      let min = 0, avg = 0, max = 0;
      if (rttLine) {
        const match = rttLine.match(/([\d.]+)\/([\d.]+)\/([\d.]+)/);
        if (match) {
          min = parseFloat(match[1]);
          avg = parseFloat(match[2]);
          max = parseFloat(match[3]);
        }
      }

      return {
        host,
        alive: received > 0,
        transmitted,
        received,
        lossPercent: loss,
        rtt: { min, avg, max },
      };
    },
  },
  {
    name: "nslookup",
    description:
      "Simple DNS lookup to resolve domain names to IP addresses. Easier alternative to dig for basic queries. Use for quick domain resolution, verifying DNS settings, or checking what IP a domain points to. Keywords: DNS lookup, nslookup, domain to IP, name server query, resolve hostname.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Domain to lookup" },
        server: { type: "string", description: "DNS server to use" },
      },
      required: ["domain"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: ["select", "copy"],
        accepts: [],
      },
    },
    handler: async ({ domain, server }) => {
      const args = [domain as string];
      if (server) args.push(server as string);

      const result = await runCommand("nslookup", args);

      const lines = result.stdout.split("\n");
      const addresses: string[] = [];

      for (const line of lines) {
        const match = line.match(/Address:\s*([^\s]+)/);
        if (match && !line.includes("#")) {
          addresses.push(match[1]);
        }
      }

      return {
        domain,
        addresses,
        resolved: addresses.length > 0,
      };
    },
  },
  {
    name: "traceroute",
    description:
      "Trace the network path to a destination showing each hop and latency. Identifies routers between source and destination, useful for diagnosing network routing issues, finding bottlenecks, or understanding network topology. Keywords: traceroute, network path, hops, routing, network topology, packet path, latency by hop.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Target host" },
        maxHops: { type: "number", description: "Maximum hops (default: 30)" },
      },
      required: ["host"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: ["select"],
        accepts: [],
      },
    },
    handler: async ({ host, maxHops = 30 }) => {
      const args = ["-m", String(maxHops), host as string];

      const result = await runCommand("traceroute", args, { timeout: 60000 });
      return { output: result.stdout, success: result.code === 0 };
    },
  },
  {
    name: "netcat",
    description:
      "Swiss army knife for TCP/UDP networking. Check if ports are open, scan port ranges, test network services. Use for port scanning, service availability checks, firewall testing, or verifying that services are listening. Keywords: netcat, nc, port scan, port check, TCP connection, service test, open ports.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Target host" },
        port: { type: "number", description: "Target port" },
        scan: { type: "boolean", description: "Port scan mode" },
        portRange: { type: "string", description: "Port range for scan (e.g., '20-80')" },
        timeout: { type: "number", description: "Timeout in seconds" },
      },
      required: ["host"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/status-badge",
        emits: ["click"],
        accepts: [],
      },
    },
    handler: async ({ host, port, scan = false, portRange, timeout = 5 }) => {
      const args = ["-z", "-v", "-w", String(timeout)];
      args.push(host as string);

      if (scan && portRange) {
        args.push(portRange as string);
      } else if (port) {
        args.push(String(port));
      }

      const result = await runCommand("nc", args, { timeout: (timeout as number) * 1000 + 5000 });
      return {
        host,
        port: port || portRange,
        open: result.code === 0,
        output: result.stderr,
      };
    },
  },
  {
    name: "wget_download",
    description:
      "Download files from URLs with wget. Supports resumable downloads, recursive website mirroring, and custom output paths. Use for downloading assets, mirroring sites, fetching remote files, or automated downloads with retry capability. Keywords: wget, file download, URL fetch, mirror website, resume download, recursive download.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to download" },
        output: { type: "string", description: "Output file path" },
        recursive: { type: "boolean", description: "Recursive download" },
        depth: { type: "number", description: "Recursion depth" },
        continueDownload: { type: "boolean", description: "Continue partial download" },
      },
      required: ["url"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/status-badge",
        emits: ["click"],
        accepts: [],
      },
    },
    handler: async ({ url, output, recursive = false, depth, continueDownload = false }) => {
      const args = ["-q"];
      if (output) args.push("-O", output as string);
      if (recursive) args.push("-r");
      if (depth) args.push("-l", String(depth));
      if (continueDownload) args.push("-c");
      args.push(url as string);

      const result = await runCommand("wget", args, { timeout: 600000 });
      if (result.code !== 0) {
        throw new Error(`wget failed: ${result.stderr}`);
      }
      return { success: true, url, output: output || "downloaded" };
    },
  },
  {
    name: "ip_address",
    description:
      "Get network interface information including IP addresses, MAC addresses, and interface status. Shows all network adapters with IPv4/IPv6 addresses and subnet masks. Use to find your IP, check network configuration, or list available interfaces. Keywords: IP address, network interface, ifconfig, ip addr, local IP, network config, MAC address.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        interface: { type: "string", description: "Specific interface" },
      },
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: ["select"],
        accepts: [],
      },
    },
    handler: async ({ interface: iface }) => {
      let result = await runCommand("ip", ["-j", "addr", "show"]);

      if (result.code === 0) {
        try {
          const data = JSON.parse(result.stdout);
          const interfaces = data.map((
            i: {
              ifname: string;
              flags: string[];
              addr_info: Array<{ family: string; local: string; prefixlen: number }>;
            },
          ) => ({
            name: i.ifname,
            flags: i.flags,
            addresses:
              i.addr_info?.map((a: { family: string; local: string; prefixlen: number }) => ({
                family: a.family,
                address: a.local,
                prefixlen: a.prefixlen,
              })) || [],
          }));

          if (iface) {
            const found = interfaces.find((i: { name: string }) => i.name === iface);
            return found || { error: `Interface ${iface} not found` };
          }
          return { interfaces };
        } catch {
          return { output: result.stdout };
        }
      }

      const ifArgs = iface ? [iface as string] : [];
      result = await runCommand("ifconfig", ifArgs);
      return { output: result.stdout };
    },
  },
  {
    name: "ip_info",
    description:
      "Analyze an IP address to determine its version (IPv4/IPv6), type (private, public, loopback, etc.), and extract detailed network information. Returns validation status, binary/decimal representations, CIDR blocks, and network class. Use for IP address validation, network classification, or understanding IP addressing schemes. Keywords: IP analysis, IPv4, IPv6, private IP, public IP, loopback, CIDR, network class, IP validation.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        ip: { type: "string", description: "IP address to analyze (IPv4 or IPv6)" },
      },
      required: ["ip"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        emits: ["copy", "expand"],
        accepts: [],
      },
    },
    handler: async ({ ip }) => {
      const ipStr = (ip as string).trim();

      // Helper: Check if string is a valid IPv4 address
      const isValidIPv4 = (addr: string): boolean => {
        const parts = addr.split(".");
        if (parts.length !== 4) return false;
        return parts.every((part) => {
          const num = parseInt(part, 10);
          return !isNaN(num) && num >= 0 && num <= 255 && String(num) === part;
        });
      };

      // Helper: Check if string is a valid IPv6 address
      const isValidIPv6 = (addr: string): boolean => {
        // Handle IPv4-mapped IPv6 addresses (::ffff:192.168.1.1)
        if (addr.includes(".")) {
          const lastColon = addr.lastIndexOf(":");
          if (lastColon === -1) return false;
          const ipv4Part = addr.substring(lastColon + 1);
          const ipv6Part = addr.substring(0, lastColon);
          if (!isValidIPv4(ipv4Part)) return false;
          // Continue validating the IPv6 portion (replace IPv4 with dummy groups)
          addr = ipv6Part + ":0:0";
        }

        // Check for :: (zero compression)
        const doubleColonCount = (addr.match(/::/g) || []).length;
        if (doubleColonCount > 1) return false;

        // Expand :: for validation
        let expanded = addr;
        if (addr.includes("::")) {
          const parts = addr.split("::");
          const left = parts[0] ? parts[0].split(":") : [];
          const right = parts[1] ? parts[1].split(":") : [];
          const missing = 8 - left.length - right.length;
          if (missing < 0) return false;
          const middle = Array(missing).fill("0");
          expanded = [...left, ...middle, ...right].join(":");
        }

        const groups = expanded.split(":");
        if (groups.length !== 8) return false;

        return groups.every((group) => {
          if (group.length === 0 || group.length > 4) return false;
          return /^[0-9a-fA-F]+$/.test(group);
        });
      };

      // Helper: Parse IPv4 to octets
      const parseIPv4Octets = (addr: string): number[] => {
        return addr.split(".").map((p) => parseInt(p, 10));
      };

      // Helper: Convert IPv4 to binary string
      const ipv4ToBinary = (octets: number[]): string => {
        return octets.map((o) => o.toString(2).padStart(8, "0")).join(".");
      };

      // Helper: Convert IPv4 to decimal
      const ipv4ToDecimal = (octets: number[]): number => {
        return (octets[0] << 24) + (octets[1] << 16) + (octets[2] << 8) + octets[3];
      };

      // Helper: Expand IPv6 to full form
      const expandIPv6 = (addr: string): string => {
        // Handle IPv4-mapped addresses
        if (addr.includes(".")) {
          const lastColon = addr.lastIndexOf(":");
          const ipv4Part = addr.substring(lastColon + 1);
          const ipv4Octets = parseIPv4Octets(ipv4Part);
          const hex1 = ((ipv4Octets[0] << 8) + ipv4Octets[1]).toString(16);
          const hex2 = ((ipv4Octets[2] << 8) + ipv4Octets[3]).toString(16);
          addr = addr.substring(0, lastColon) + ":" + hex1 + ":" + hex2;
        }

        if (addr.includes("::")) {
          const parts = addr.split("::");
          const left = parts[0] ? parts[0].split(":") : [];
          const right = parts[1] ? parts[1].split(":") : [];
          const missing = 8 - left.length - right.length;
          const middle = Array(missing).fill("0000");
          return [...left, ...middle, ...right]
            .map((g) => g.padStart(4, "0"))
            .join(":");
        }

        return addr.split(":").map((g) => g.padStart(4, "0")).join(":");
      };

      // Helper: Compress IPv6 to shortest form
      const compressIPv6 = (expanded: string): string => {
        const groups = expanded.split(":").map((g) => g.replace(/^0+/, "") || "0");

        // Find longest run of zeros
        let bestStart = -1;
        let bestLen = 0;
        let currentStart = -1;
        let currentLen = 0;

        for (let i = 0; i < groups.length; i++) {
          if (groups[i] === "0") {
            if (currentStart === -1) currentStart = i;
            currentLen++;
          } else {
            if (currentLen > bestLen) {
              bestStart = currentStart;
              bestLen = currentLen;
            }
            currentStart = -1;
            currentLen = 0;
          }
        }
        if (currentLen > bestLen) {
          bestStart = currentStart;
          bestLen = currentLen;
        }

        if (bestLen > 1) {
          const before = groups.slice(0, bestStart);
          const after = groups.slice(bestStart + bestLen);
          if (before.length === 0 && after.length === 0) return "::";
          if (before.length === 0) return "::" + after.join(":");
          if (after.length === 0) return before.join(":") + "::";
          return before.join(":") + "::" + after.join(":");
        }

        return groups.join(":");
      };

      // Helper: Get IPv4 type
      const getIPv4Type = (
        octets: number[],
      ): {
        type: "private" | "public" | "loopback" | "link-local" | "multicast" | "reserved";
        isPrivate: boolean;
        isLoopback: boolean;
        isMulticast: boolean;
        cidrBlock?: string;
        networkClass?: "A" | "B" | "C" | "D" | "E";
      } => {
        const [first, second] = octets;

        // Loopback: 127.0.0.0/8
        if (first === 127) {
          return {
            type: "loopback",
            isPrivate: false,
            isLoopback: true,
            isMulticast: false,
            cidrBlock: "127.0.0.0/8",
            networkClass: "A",
          };
        }

        // Link-local: 169.254.0.0/16
        if (first === 169 && second === 254) {
          return {
            type: "link-local",
            isPrivate: false,
            isLoopback: false,
            isMulticast: false,
            cidrBlock: "169.254.0.0/16",
            networkClass: "B",
          };
        }

        // Multicast: 224.0.0.0/4
        if (first >= 224 && first <= 239) {
          return {
            type: "multicast",
            isPrivate: false,
            isLoopback: false,
            isMulticast: true,
            cidrBlock: "224.0.0.0/4",
            networkClass: "D",
          };
        }

        // Reserved: 240.0.0.0/4
        if (first >= 240) {
          return {
            type: "reserved",
            isPrivate: false,
            isLoopback: false,
            isMulticast: false,
            cidrBlock: "240.0.0.0/4",
            networkClass: "E",
          };
        }

        // Private: 10.0.0.0/8
        if (first === 10) {
          return {
            type: "private",
            isPrivate: true,
            isLoopback: false,
            isMulticast: false,
            cidrBlock: "10.0.0.0/8",
            networkClass: "A",
          };
        }

        // Private: 172.16.0.0/12
        if (first === 172 && second >= 16 && second <= 31) {
          return {
            type: "private",
            isPrivate: true,
            isLoopback: false,
            isMulticast: false,
            cidrBlock: "172.16.0.0/12",
            networkClass: "B",
          };
        }

        // Private: 192.168.0.0/16
        if (first === 192 && second === 168) {
          return {
            type: "private",
            isPrivate: true,
            isLoopback: false,
            isMulticast: false,
            cidrBlock: "192.168.0.0/16",
            networkClass: "C",
          };
        }

        // 0.0.0.0/8 - Current network
        if (first === 0) {
          return {
            type: "reserved",
            isPrivate: false,
            isLoopback: false,
            isMulticast: false,
            cidrBlock: "0.0.0.0/8",
            networkClass: "A",
          };
        }

        // Network class for public IPs
        let networkClass: "A" | "B" | "C" | "D" | "E";
        if (first < 128) networkClass = "A";
        else if (first < 192) networkClass = "B";
        else if (first < 224) networkClass = "C";
        else if (first < 240) networkClass = "D";
        else networkClass = "E";

        return {
          type: "public",
          isPrivate: false,
          isLoopback: false,
          isMulticast: false,
          networkClass,
        };
      };

      // Helper: Get IPv6 type
      const getIPv6Type = (
        expanded: string,
      ): {
        type: "private" | "public" | "loopback" | "link-local" | "multicast" | "reserved";
        isPrivate: boolean;
        isLoopback: boolean;
        isMulticast: boolean;
        cidrBlock?: string;
      } => {
        const groups = expanded.split(":").map((g) => parseInt(g, 16));
        const first = groups[0];

        // Loopback: ::1
        if (expanded === "0000:0000:0000:0000:0000:0000:0000:0001") {
          return {
            type: "loopback",
            isPrivate: false,
            isLoopback: true,
            isMulticast: false,
            cidrBlock: "::1/128",
          };
        }

        // Unspecified: ::
        if (expanded === "0000:0000:0000:0000:0000:0000:0000:0000") {
          return {
            type: "reserved",
            isPrivate: false,
            isLoopback: false,
            isMulticast: false,
            cidrBlock: "::/128",
          };
        }

        // Multicast: ff00::/8
        if ((first & 0xff00) === 0xff00) {
          return {
            type: "multicast",
            isPrivate: false,
            isLoopback: false,
            isMulticast: true,
            cidrBlock: "ff00::/8",
          };
        }

        // Link-local: fe80::/10
        if ((first & 0xffc0) === 0xfe80) {
          return {
            type: "link-local",
            isPrivate: false,
            isLoopback: false,
            isMulticast: false,
            cidrBlock: "fe80::/10",
          };
        }

        // Unique Local (ULA): fc00::/7 (fc00::/8 and fd00::/8)
        if ((first & 0xfe00) === 0xfc00) {
          return {
            type: "private",
            isPrivate: true,
            isLoopback: false,
            isMulticast: false,
            cidrBlock: "fc00::/7",
          };
        }

        // Global unicast (public): 2000::/3
        if ((first & 0xe000) === 0x2000) {
          return {
            type: "public",
            isPrivate: false,
            isLoopback: false,
            isMulticast: false,
            cidrBlock: "2000::/3",
          };
        }

        // IPv4-mapped IPv6: ::ffff:0:0/96
        if (
          groups[0] === 0 && groups[1] === 0 && groups[2] === 0 &&
          groups[3] === 0 && groups[4] === 0 && groups[5] === 0xffff
        ) {
          return {
            type: "reserved",
            isPrivate: false,
            isLoopback: false,
            isMulticast: false,
            cidrBlock: "::ffff:0:0/96",
          };
        }

        // Other reserved
        return {
          type: "reserved",
          isPrivate: false,
          isLoopback: false,
          isMulticast: false,
        };
      };

      // Determine IP version
      const isIPv4 = isValidIPv4(ipStr);
      const isIPv6 = !isIPv4 && isValidIPv6(ipStr);

      if (!isIPv4 && !isIPv6) {
        return {
          ip: ipStr,
          valid: false,
          error: "Invalid IP address format",
        };
      }

      if (isIPv4) {
        const octets = parseIPv4Octets(ipStr);
        const binary = ipv4ToBinary(octets);
        const decimal = ipv4ToDecimal(octets);
        const typeInfo = getIPv4Type(octets);

        return {
          ip: ipStr,
          valid: true,
          version: 4,
          type: typeInfo.type,
          isPrivate: typeInfo.isPrivate,
          isLoopback: typeInfo.isLoopback,
          isMulticast: typeInfo.isMulticast,
          octets,
          binary,
          decimal,
          cidrBlock: typeInfo.cidrBlock,
          networkClass: typeInfo.networkClass,
        };
      }

      // IPv6
      const expanded = expandIPv6(ipStr);
      const compressed = compressIPv6(expanded);
      const groups = expanded.split(":");
      const typeInfo = getIPv6Type(expanded);

      return {
        ip: ipStr,
        valid: true,
        version: 6,
        type: typeInfo.type,
        isPrivate: typeInfo.isPrivate,
        isLoopback: typeInfo.isLoopback,
        isMulticast: typeInfo.isMulticast,
        groups,
        expanded,
        compressed,
        cidrBlock: typeInfo.cidrBlock,
      };
    },
  },
  {
    name: "ssl_check",
    description:
      "Check SSL/TLS certificate for a host. Returns certificate details including subject, issuer, validity dates, days remaining, SANs (Subject Alternative Names), and chain information. Use for SSL certificate monitoring, expiration checking, or security audits. Keywords: SSL certificate, TLS check, HTTPS certificate, cert expiry, certificate chain, security audit, SSL validity.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Hostname to check (e.g., example.com)" },
        port: { type: "number", description: "Port number (default: 443)" },
      },
      required: ["host"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/certificate-viewer",
        emits: ["copy", "expand"],
        accepts: [],
      },
    },
    handler: async ({ host, port = 443 }) => {
      const hostStr = host as string;
      const portNum = port as number;

      // First, get full certificate text for parsing
      const certTextResult = await runCommand("sh", [
        "-c",
        `echo | openssl s_client -connect ${hostStr}:${portNum} -servername ${hostStr} 2>/dev/null | openssl x509 -noout -text 2>/dev/null`,
      ], { timeout: 30000 });

      // Get specific fields for easier parsing
      const certFieldsResult = await runCommand("sh", [
        "-c",
        `echo | openssl s_client -connect ${hostStr}:${portNum} -servername ${hostStr} 2>/dev/null | openssl x509 -noout -subject -issuer -dates -serial -ext subjectAltName 2>/dev/null`,
      ], { timeout: 30000 });

      // Get certificate chain
      const chainResult = await runCommand("sh", [
        "-c",
        `echo | openssl s_client -connect ${hostStr}:${portNum} -servername ${hostStr} -showcerts 2>/dev/null | grep -E "s:|i:" | head -20`,
      ], { timeout: 30000 });

      if (certFieldsResult.code !== 0 && certTextResult.code !== 0) {
        throw new Error(`Failed to retrieve SSL certificate for ${hostStr}:${portNum}`);
      }

      // Parse certificate fields
      const lines = certFieldsResult.stdout.split("\n");
      const parsed: Record<string, string> = {};

      for (const line of lines) {
        if (line.startsWith("subject=")) {
          parsed.subject = line.substring(8).trim();
        } else if (line.startsWith("issuer=")) {
          parsed.issuer = line.substring(7).trim();
        } else if (line.startsWith("notBefore=")) {
          parsed.notBefore = line.substring(10).trim();
        } else if (line.startsWith("notAfter=")) {
          parsed.notAfter = line.substring(9).trim();
        } else if (line.startsWith("serial=")) {
          parsed.serial = line.substring(7).trim();
        }
      }

      // Parse Subject Alternative Names
      const sans: string[] = [];
      const sanMatch = certFieldsResult.stdout.match(/DNS:[^,\n]+/g);
      if (sanMatch) {
        sanMatch.forEach((m) => sans.push(m.replace("DNS:", "").trim()));
      }

      // Parse subject components
      const parseX509Name = (name: string): Record<string, string> => {
        const result: Record<string, string> = {};
        const parts = name.split(",").map((p) => p.trim());
        for (const part of parts) {
          const [key, ...valueParts] = part.split("=");
          if (key && valueParts.length > 0) {
            result[key.trim()] = valueParts.join("=").trim();
          }
        }
        return result;
      };

      const subject = parseX509Name(parsed.subject || "");
      const issuer = parseX509Name(parsed.issuer || "");

      // Parse dates
      const validFrom = parsed.notBefore ? new Date(parsed.notBefore).toISOString() : "";
      const validTo = parsed.notAfter ? new Date(parsed.notAfter).toISOString() : "";

      // Calculate days remaining
      const now = new Date();
      const expiry = new Date(validTo);
      const daysRemaining = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Parse signature algorithm from full text
      let signatureAlgorithm = "";
      const sigMatch = certTextResult.stdout.match(/Signature Algorithm:\s*([^\n]+)/);
      if (sigMatch) {
        signatureAlgorithm = sigMatch[1].trim();
      }

      // Parse certificate chain
      const chain: Array<{ subject: string; issuer: string }> = [];
      const chainLines = chainResult.stdout.split("\n");
      for (let i = 0; i < chainLines.length; i += 2) {
        const subjectLine = chainLines[i];
        const issuerLine = chainLines[i + 1];
        if (subjectLine?.startsWith(" s:") && issuerLine?.startsWith(" i:")) {
          chain.push({
            subject: subjectLine.substring(3).trim(),
            issuer: issuerLine.substring(3).trim(),
          });
        }
      }

      // Determine validity
      const isExpired = daysRemaining < 0;
      const isExpiringSoon = daysRemaining >= 0 && daysRemaining <= 30;
      const valid = !isExpired;

      return {
        host: hostStr,
        port: portNum,
        valid,
        certificate: {
          subject,
          issuer,
          validFrom,
          validTo,
          daysRemaining,
          serialNumber: parsed.serial || "",
          signatureAlgorithm,
          sans,
        },
        chain: chain.length > 0 ? chain : undefined,
        status: isExpired ? "expired" : isExpiringSoon ? "expiring" : "valid",
      };
    },
  },
  {
    name: "whois_lookup",
    description:
      "Lookup WHOIS information for a domain to find registration details, owner info, nameservers, and expiration dates. Returns parsed domain data including registrar, creation date, expiry date, and DNS servers. Use for domain research, ownership verification, or checking domain availability. Keywords: WHOIS, domain lookup, domain info, registrar, domain owner, nameservers, domain expiry.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Domain name to lookup (e.g., example.com)" },
      },
      required: ["domain"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/json-viewer",
        emits: ["copy", "expand"],
        accepts: [],
      },
    },
    handler: async ({ domain }) => {
      const domainStr = domain as string;

      // Clean domain (remove protocol, www, paths)
      const cleanDomain = domainStr
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0]
        .trim()
        .toLowerCase();

      const result = await runCommand("whois", [cleanDomain], { timeout: 30000 });

      if (result.code !== 0) {
        throw new Error(`WHOIS lookup failed: ${result.stderr || "Unknown error"}`);
      }

      const output = result.stdout;
      const lines = output.split("\n");

      // Parse common WHOIS fields
      const parsed: Record<string, string | string[]> = {};
      const nameservers: string[] = [];

      const fieldMappings: Record<string, string[]> = {
        registrar: ["Registrar:", "Sponsoring Registrar:", "registrar:"],
        registrantName: ["Registrant Name:", "Registrant:", "registrant:"],
        registrantOrg: ["Registrant Organization:", "Registrant Organisation:"],
        registrantEmail: ["Registrant Email:"],
        creationDate: ["Creation Date:", "Created:", "created:", "Registration Date:"],
        expiryDate: ["Expiry Date:", "Registry Expiry Date:", "expires:", "Expiration Date:"],
        updatedDate: ["Updated Date:", "Last Updated:", "changed:"],
        status: ["Domain Status:", "Status:"],
        dnssec: ["DNSSEC:", "dnssec:"],
      };

      for (const line of lines) {
        const trimmedLine = line.trim();

        // Extract nameservers
        if (/^Name Server:|^nserver:/i.test(trimmedLine)) {
          const ns = trimmedLine.split(":")[1]?.trim().toLowerCase();
          if (ns && !nameservers.includes(ns)) {
            nameservers.push(ns);
          }
        }

        // Extract other fields
        for (const [field, patterns] of Object.entries(fieldMappings)) {
          for (const pattern of patterns) {
            if (trimmedLine.toLowerCase().startsWith(pattern.toLowerCase())) {
              const value = trimmedLine.substring(pattern.length).trim();
              if (value) {
                // For status, collect all values
                if (field === "status") {
                  if (!parsed[field]) parsed[field] = [];
                  (parsed[field] as string[]).push(value.split(" ")[0]); // Get first part before space
                } else if (!parsed[field]) {
                  parsed[field] = value;
                }
              }
              break;
            }
          }
        }
      }

      // Calculate days until expiry if we have expiry date
      let daysUntilExpiry: number | null = null;
      if (parsed.expiryDate) {
        try {
          const expiryDate = new Date(parsed.expiryDate as string);
          const now = new Date();
          daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        } catch {
          // Ignore date parsing errors
        }
      }

      return {
        domain: cleanDomain,
        registrar: parsed.registrar || null,
        registrant: {
          name: parsed.registrantName || null,
          organization: parsed.registrantOrg || null,
          email: parsed.registrantEmail || null,
        },
        dates: {
          created: parsed.creationDate || null,
          expires: parsed.expiryDate || null,
          updated: parsed.updatedDate || null,
          daysUntilExpiry,
        },
        nameservers: nameservers.length > 0 ? nameservers : null,
        status: parsed.status || null,
        dnssec: parsed.dnssec || null,
        raw: output,
      };
    },
  },
  {
    name: "netstat_connections",
    description:
      "List active network connections showing protocol, local/remote addresses, ports, and connection state. Filter by listening ports, established connections, or view all. Use for network debugging, security audits, finding open ports, or monitoring active connections. Keywords: netstat, network connections, open ports, listening ports, established connections, TCP UDP, socket connections, active connections.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        state: {
          type: "string",
          enum: ["all", "listening", "established"],
          description: "Filter connections by state (default: all)",
        },
      },
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: ["select", "sort", "filter"],
        accepts: ["highlight", "refresh"],
      },
    },
    handler: async ({ state = "all" }) => {
      // Try using 'ss' first (modern replacement for netstat)
      const ssArgs = ["-tunapl"];

      // Add state filter
      if (state === "listening") {
        ssArgs.push("state", "listening");
      } else if (state === "established") {
        ssArgs.push("state", "established");
      }

      let result = await runCommand("ss", ssArgs);

      if (result.code !== 0) {
        // Fallback to netstat if ss is not available
        const netstatArgs = ["-tunapl"];
        result = await runCommand("netstat", netstatArgs);

        if (result.code !== 0) {
          throw new Error(`Failed to get network connections: ${result.stderr}`);
        }
      }

      const lines = result.stdout.trim().split("\n");
      const connections: Array<{
        protocol: string;
        localAddress: string;
        localPort: string | number;
        remoteAddress: string;
        remotePort: string | number;
        state: string;
        process?: string;
      }> = [];

      // Skip header line(s)
      const dataLines = lines.slice(1).filter((line) => line.trim());

      for (const line of dataLines) {
        const parts = line.split(/\s+/).filter(Boolean);

        if (parts.length < 5) continue;

        // Parse ss output format: Netid State Recv-Q Send-Q Local Address:Port Peer Address:Port Process
        // Or netstat format: Proto Recv-Q Send-Q Local Address Foreign Address State PID/Program
        const protocol = parts[0].toLowerCase();

        // Skip non-TCP/UDP entries
        if (!protocol.startsWith("tcp") && !protocol.startsWith("udp")) continue;

        let localAddr = "";
        let localPort: string | number = "";
        let remoteAddr = "";
        let remotePort: string | number = "";
        let connState = "";
        let processInfo = "";

        // ss format detection (has 'State' field at position 1)
        if (
          parts[1] === "LISTEN" || parts[1] === "ESTAB" || parts[1] === "TIME-WAIT" ||
          parts[1] === "CLOSE-WAIT" || parts[1] === "SYN-SENT" || parts[1] === "SYN-RECV"
        ) {
          // ss format
          connState = parts[1];
          const localParts = (parts[4] || "").split(":");
          localPort = localParts.pop() || "";
          localAddr = localParts.join(":") || "*";

          const remoteParts = (parts[5] || "").split(":");
          remotePort = remoteParts.pop() || "";
          remoteAddr = remoteParts.join(":") || "*";

          processInfo = parts.slice(6).join(" ");
        } else {
          // netstat format or ss without state (e.g., UDP)
          const localFull = parts[4] || parts[3];
          const remoteFull = parts[5] || parts[4];

          const localParts = localFull.split(":");
          localPort = localParts.pop() || "";
          localAddr = localParts.join(":") || "*";

          const remoteParts = remoteFull.split(":");
          remotePort = remoteParts.pop() || "";
          remoteAddr = remoteParts.join(":") || "*";

          // State is typically at position 5 for TCP, may not exist for UDP
          if (protocol.startsWith("tcp")) {
            connState = parts[6] || parts[5] || "";
          }
          processInfo = parts.slice(protocol.startsWith("tcp") ? 7 : 6).join(" ");
        }

        // Apply state filter manually if needed
        const normalizedState = connState.toUpperCase();
        if (state === "listening" && normalizedState !== "LISTEN") continue;
        if (state === "established" && normalizedState !== "ESTAB" && normalizedState !== "ESTABLISHED") continue;

        // Parse port numbers
        const parsedLocalPort = localPort === "*" ? "*" : parseInt(String(localPort), 10) || localPort;
        const parsedRemotePort = remotePort === "*" ? "*" : parseInt(String(remotePort), 10) || remotePort;

        connections.push({
          protocol,
          localAddress: localAddr === "" ? "*" : localAddr,
          localPort: parsedLocalPort,
          remoteAddress: remoteAddr === "" ? "*" : remoteAddr,
          remotePort: parsedRemotePort,
          state: connState || (protocol.startsWith("udp") ? "UNCONN" : ""),
          process: processInfo || undefined,
        });
      }

      // Sort by local port
      connections.sort((a, b) => {
        const portA = typeof a.localPort === "number" ? a.localPort : 0;
        const portB = typeof b.localPort === "number" ? b.localPort : 0;
        return portA - portB;
      });

      return {
        filter: state,
        connections,
        count: connections.length,
        summary: {
          tcp: connections.filter((c) => c.protocol.startsWith("tcp")).length,
          udp: connections.filter((c) => c.protocol.startsWith("udp")).length,
          listening: connections.filter((c) => c.state === "LISTEN").length,
          established: connections.filter((c) => c.state === "ESTAB" || c.state === "ESTABLISHED").length,
        },
      };
    },
  },
  {
    name: "port_scan",
    description:
      "Scan ports on a host to check which are open. Tests TCP connectivity to specified ports and identifies running services. Use for security audits, network diagnostics, service discovery, or verifying firewall rules. Keywords: port scan, open ports, TCP scan, service discovery, security audit, network scanner, port check.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Host to scan (IP or hostname)" },
        ports: {
          type: "string",
          description: 'Ports to scan (comma-separated or range like "1-1000", default: "22,80,443,3000,5432,6379,8080")',
        },
        timeout: { type: "number", description: "Connection timeout in ms (default: 1000)" },
      },
      required: ["host"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/port-scanner",
        emits: ["select"],
        accepts: [],
      },
    },
    handler: async ({ host, ports = "22,80,443,3000,5432,6379,8080", timeout = 1000 }) => {
      const hostStr = host as string;
      const portsStr = ports as string;
      const timeoutMs = timeout as number;

      // Well-known port to service mapping
      const serviceMap: Record<number, string> = {
        20: "FTP-DATA",
        21: "FTP",
        22: "SSH",
        23: "Telnet",
        25: "SMTP",
        53: "DNS",
        67: "DHCP",
        68: "DHCP",
        69: "TFTP",
        80: "HTTP",
        110: "POP3",
        111: "RPC",
        119: "NNTP",
        123: "NTP",
        135: "MSRPC",
        137: "NetBIOS",
        138: "NetBIOS",
        139: "NetBIOS",
        143: "IMAP",
        161: "SNMP",
        162: "SNMP-Trap",
        179: "BGP",
        389: "LDAP",
        443: "HTTPS",
        445: "SMB",
        465: "SMTPS",
        514: "Syslog",
        515: "LPD",
        587: "SMTP",
        636: "LDAPS",
        993: "IMAPS",
        995: "POP3S",
        1080: "SOCKS",
        1433: "MSSQL",
        1434: "MSSQL-UDP",
        1521: "Oracle",
        1723: "PPTP",
        2049: "NFS",
        2181: "Zookeeper",
        3000: "Node.js",
        3306: "MySQL",
        3389: "RDP",
        4369: "EPMD",
        5000: "Flask",
        5432: "PostgreSQL",
        5672: "RabbitMQ",
        5900: "VNC",
        6379: "Redis",
        6443: "Kubernetes",
        8000: "HTTP-Alt",
        8080: "HTTP-Proxy",
        8081: "HTTP-Alt",
        8443: "HTTPS-Alt",
        8888: "HTTP-Alt",
        9000: "PHP-FPM",
        9042: "Cassandra",
        9090: "Prometheus",
        9092: "Kafka",
        9200: "Elasticsearch",
        9300: "Elasticsearch",
        11211: "Memcached",
        27017: "MongoDB",
        27018: "MongoDB",
        27019: "MongoDB",
      };

      // Parse ports string to array of port numbers
      const parsePorts = (portsInput: string): number[] => {
        const result: number[] = [];
        const parts = portsInput.split(",").map((p) => p.trim());

        for (const part of parts) {
          if (part.includes("-")) {
            // Range like "1-1000"
            const [start, end] = part.split("-").map((n) => parseInt(n.trim(), 10));
            if (!isNaN(start) && !isNaN(end) && start <= end) {
              for (let i = start; i <= end; i++) {
                if (i >= 1 && i <= 65535 && !result.includes(i)) {
                  result.push(i);
                }
              }
            }
          } else {
            // Single port
            const port = parseInt(part, 10);
            if (!isNaN(port) && port >= 1 && port <= 65535 && !result.includes(port)) {
              result.push(port);
            }
          }
        }

        return result.sort((a, b) => a - b);
      };

      // Scan a single port using Deno.connect
      const scanPort = async (port: number): Promise<{ port: number; state: "open" | "closed"; service: string }> => {
        const service = serviceMap[port] || "unknown";

        try {
          const conn = await Promise.race([
            Deno.connect({ hostname: hostStr, port }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("timeout")), timeoutMs)
            ),
          ]);

          // Connection succeeded, port is open
          (conn as Deno.Conn).close();
          return { port, state: "open", service };
        } catch {
          // Connection failed or timed out, port is closed/filtered
          return { port, state: "closed", service };
        }
      };

      const startTime = performance.now();
      const portList = parsePorts(portsStr);

      // Scan all ports concurrently with a reasonable batch size
      const batchSize = 50;
      const results: Array<{ port: number; state: "open" | "closed"; service: string }> = [];

      for (let i = 0; i < portList.length; i += batchSize) {
        const batch = portList.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(scanPort));
        results.push(...batchResults);
      }

      const endTime = performance.now();
      const scanTime = Math.round(endTime - startTime);

      // Sort by port number
      results.sort((a, b) => a.port - b.port);

      const openPorts = results.filter((r) => r.state === "open");

      return {
        host: hostStr,
        ports: results,
        openCount: openPorts.length,
        scanTime,
      };
    },
  },
];
