/**
 * Unit tests for IP tools
 *
 * @module lib/std/tests/iptools_test
 */

import { assertEquals } from "@std/assert";
import { iptoolsTools } from "../src/tools/iptools.ts";

// Helper to get tool handler
const getHandler = (name: string) => {
  const tool = iptoolsTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool.handler;
};

// CIDR calculate tests
Deno.test("cidr_calculate - basic subnet", () => {
  const handler = getHandler("cidr_calculate");
  const result = handler({ cidr: "192.168.1.0/24" }) as {
    network: string;
    broadcast: string;
    netmask: string;
    usableHosts: number;
  };

  assertEquals(result.network, "192.168.1.0");
  assertEquals(result.broadcast, "192.168.1.255");
  assertEquals(result.netmask, "255.255.255.0");
  assertEquals(result.usableHosts, 254);
});

Deno.test("cidr_calculate - /32 single host", () => {
  const handler = getHandler("cidr_calculate");
  const result = handler({ cidr: "10.0.0.1/32" }) as { usableHosts: number };

  assertEquals(result.usableHosts, 1);
});

Deno.test("cidr_calculate - /16 large subnet", () => {
  const handler = getHandler("cidr_calculate");
  const result = handler({ cidr: "172.16.0.0/16" }) as { usableHosts: number; totalAddresses: number };

  assertEquals(result.totalAddresses, 65536);
  assertEquals(result.usableHosts, 65534);
});

Deno.test("cidr_calculate - detects private network", () => {
  const handler = getHandler("cidr_calculate");
  const result = handler({ cidr: "192.168.0.0/16" }) as { isPrivate: boolean };

  assertEquals(result.isPrivate, true);
});

Deno.test("cidr_calculate - invalid IP", () => {
  const handler = getHandler("cidr_calculate");
  const result = handler({ cidr: "999.999.999.999/24" }) as { error: string };

  assertEquals(result.error, "Invalid IPv4 address");
});

// CIDR contains tests
Deno.test("cidr_contains - IP in range", () => {
  const handler = getHandler("cidr_contains");
  const result = handler({ cidr: "192.168.1.0/24", ip: "192.168.1.100" }) as { contains: boolean };

  assertEquals(result.contains, true);
});

Deno.test("cidr_contains - IP not in range", () => {
  const handler = getHandler("cidr_contains");
  const result = handler({ cidr: "192.168.1.0/24", ip: "192.168.2.1" }) as { contains: boolean };

  assertEquals(result.contains, false);
});

Deno.test("cidr_contains - edge case network address", () => {
  const handler = getHandler("cidr_contains");
  const result = handler({ cidr: "10.0.0.0/8", ip: "10.0.0.0" }) as { contains: boolean };

  assertEquals(result.contains, true);
});

// Subnet divide tests
Deno.test("subnet_divide - divide by count", () => {
  const handler = getHandler("subnet_divide");
  const result = handler({ cidr: "192.168.0.0/24", count: 4 }) as {
    subnetCount: number;
    newPrefix: number;
    subnets: Array<{ cidr: string }>;
  };

  assertEquals(result.subnetCount, 4);
  assertEquals(result.newPrefix, 26);
  assertEquals(result.subnets.length, 4);
});

Deno.test("subnet_divide - divide by new prefix", () => {
  const handler = getHandler("subnet_divide");
  const result = handler({ cidr: "10.0.0.0/16", newPrefix: 24 }) as {
    subnetCount: number;
    hostsPerSubnet: number;
  };

  assertEquals(result.subnetCount, 256);
  assertEquals(result.hostsPerSubnet, 254);
});

// IP convert tests
Deno.test("ip_convert - dotted to all formats", () => {
  const handler = getHandler("ip_convert");
  const result = handler({ ip: "192.168.1.1" }) as {
    dotted: string;
    integer: number;
    hex: string;
  };

  assertEquals(result.dotted, "192.168.1.1");
  assertEquals(result.integer, 3232235777);
  assertEquals(result.hex, "0xc0a80101");
});

Deno.test("ip_convert - integer to dotted", () => {
  const handler = getHandler("ip_convert");
  const result = handler({ ip: "3232235777", from: "integer" }) as { dotted: string };

  assertEquals(result.dotted, "192.168.1.1");
});

Deno.test("ip_convert - hex to dotted", () => {
  const handler = getHandler("ip_convert");
  const result = handler({ ip: "0xc0a80101", from: "hex" }) as { dotted: string };

  assertEquals(result.dotted, "192.168.1.1");
});

// IPv6 expand tests
Deno.test("ipv6_expand - expands compressed address", () => {
  const handler = getHandler("ipv6_expand");
  const result = handler({ ipv6: "2001:db8::1" }) as { expanded: string };

  assertEquals(result.expanded, "2001:0db8:0000:0000:0000:0000:0000:0001");
});

Deno.test("ipv6_expand - compresses full address", () => {
  const handler = getHandler("ipv6_expand");
  const result = handler({ ipv6: "2001:0db8:0000:0000:0000:0000:0000:0001" }) as { compressed: string };

  assertEquals(result.compressed, "2001:db8::1");
});

Deno.test("ipv6_expand - handles loopback", () => {
  const handler = getHandler("ipv6_expand");
  const result = handler({ ipv6: "::1" }) as { expanded: string };

  assertEquals(result.expanded, "0000:0000:0000:0000:0000:0000:0000:0001");
});

// MAC format tests
Deno.test("mac_format - colon format", () => {
  const handler = getHandler("mac_format");
  const result = handler({ mac: "001122334455" }) as { formatted: string };

  assertEquals(result.formatted, "00:11:22:33:44:55");
});

Deno.test("mac_format - dash format", () => {
  const handler = getHandler("mac_format");
  const result = handler({ mac: "00:11:22:33:44:55", format: "dash" }) as { formatted: string };

  assertEquals(result.formatted, "00-11-22-33-44-55");
});

Deno.test("mac_format - cisco dot format", () => {
  const handler = getHandler("mac_format");
  const result = handler({ mac: "00:11:22:33:44:55", format: "dot" }) as { formatted: string };

  assertEquals(result.formatted, "0011.2233.4455");
});

Deno.test("mac_format - extracts OUI", () => {
  const handler = getHandler("mac_format");
  const result = handler({ mac: "00:11:22:33:44:55" }) as { oui: string };

  assertEquals(result.oui, "00:11:22");
});

// IP range tests
Deno.test("ip_range - calculates range", () => {
  const handler = getHandler("ip_range");
  const result = handler({ start: "192.168.1.0", end: "192.168.1.255" }) as {
    totalIps: number;
    cidrs: string[];
    cidrCount: number;
  };

  assertEquals(result.totalIps, 256);
  // The algorithm produces CIDRs that cover the range
  assertEquals(result.cidrCount > 0, true);
  assertEquals(result.cidrs[0].startsWith("192.168.1."), true);
});

Deno.test("ip_range - single IP", () => {
  const handler = getHandler("ip_range");
  const result = handler({ start: "10.0.0.1", end: "10.0.0.1" }) as { totalIps: number };

  assertEquals(result.totalIps, 1);
});

Deno.test("ip_range - error on reversed range", () => {
  const handler = getHandler("ip_range");
  const result = handler({ start: "192.168.1.255", end: "192.168.1.0" }) as { error: string };

  assertEquals(result.error, "Start IP must be less than or equal to end IP");
});
