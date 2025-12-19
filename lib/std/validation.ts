/**
 * Validation tools
 *
 * Uses zod for schema validation and validator for format checks.
 *
 * @module lib/std/validation
 */

import { z } from "zod";
import validator from "validator";
import type { MiniTool } from "./types.ts";

export const validationTools: MiniTool[] = [
  {
    name: "validate_email",
    description: "Validate email address format",
    category: "validation",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Email to validate" },
      },
      required: ["email"],
    },
    handler: ({ email }) => ({
      valid: validator.isEmail(email as string),
      normalized: validator.normalizeEmail(email as string) || email,
    }),
  },
  {
    name: "validate_url",
    description: "Validate URL format",
    category: "validation",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to validate" },
        protocols: {
          type: "array",
          items: { type: "string" },
          description: "Allowed protocols (default: ['http', 'https'])",
        },
        requireProtocol: { type: "boolean", description: "Require protocol (default: true)" },
      },
      required: ["url"],
    },
    handler: ({ url, protocols = ["http", "https"], requireProtocol = true }) => ({
      valid: validator.isURL(url as string, {
        protocols: protocols as string[],
        require_protocol: requireProtocol as boolean,
      }),
    }),
  },
  {
    name: "validate_uuid",
    description: "Validate UUID format",
    category: "validation",
    inputSchema: {
      type: "object",
      properties: {
        uuid: { type: "string", description: "UUID to validate" },
        version: { type: "number", enum: [1, 2, 3, 4, 5], description: "UUID version" },
      },
      required: ["uuid"],
    },
    handler: ({ uuid, version }) => ({
      valid: validator.isUUID(uuid as string, version as 1 | 2 | 3 | 4 | 5 | undefined),
    }),
  },
  {
    name: "validate_credit_card",
    description: "Validate credit card number (Luhn algorithm)",
    category: "validation",
    inputSchema: {
      type: "object",
      properties: {
        number: { type: "string", description: "Credit card number" },
      },
      required: ["number"],
    },
    handler: ({ number }) => ({
      valid: validator.isCreditCard(number as string),
    }),
  },
  {
    name: "validate_ip",
    description: "Validate IP address (v4 or v6)",
    category: "validation",
    inputSchema: {
      type: "object",
      properties: {
        ip: { type: "string", description: "IP address" },
        version: { type: "number", enum: [4, 6], description: "IP version (4 or 6)" },
      },
      required: ["ip"],
    },
    handler: ({ ip, version }) => ({
      valid: validator.isIP(ip as string, version as 4 | 6 | undefined),
      isIPv4: validator.isIP(ip as string, 4),
      isIPv6: validator.isIP(ip as string, 6),
    }),
  },
  {
    name: "validate_json",
    description: "Validate JSON string and optionally check against schema",
    category: "validation",
    inputSchema: {
      type: "object",
      properties: {
        json: { type: "string", description: "JSON string to validate" },
      },
      required: ["json"],
    },
    handler: ({ json }) => {
      try {
        const parsed = JSON.parse(json as string);
        return { valid: true, parsed };
      } catch (e) {
        return { valid: false, error: (e as Error).message };
      }
    },
  },
  {
    name: "validate_schema",
    description: "Validate data against a Zod-compatible schema definition",
    category: "validation",
    inputSchema: {
      type: "object",
      properties: {
        data: { description: "Data to validate" },
        schema: {
          type: "object",
          description:
            "Schema definition object (e.g., { type: 'object', properties: { name: { type: 'string' } } })",
        },
      },
      required: ["data", "schema"],
    },
    handler: ({ data, schema }) => {
      // Convert simple schema definition to Zod schema
      const buildZodSchema = (def: Record<string, unknown>): z.ZodTypeAny => {
        const type = def.type as string;
        switch (type) {
          case "string": {
            let s = z.string();
            if (def.minLength) s = s.min(def.minLength as number);
            if (def.maxLength) s = s.max(def.maxLength as number);
            if (def.pattern) s = s.regex(new RegExp(def.pattern as string));
            if (def.email) s = s.email();
            if (def.url) s = s.url();
            return def.optional ? s.optional() : s;
          }
          case "number": {
            let n = z.number();
            if (def.min !== undefined) n = n.min(def.min as number);
            if (def.max !== undefined) n = n.max(def.max as number);
            if (def.int) n = n.int();
            return def.optional ? n.optional() : n;
          }
          case "boolean":
            return def.optional ? z.boolean().optional() : z.boolean();
          case "array": {
            const items = def.items
              ? buildZodSchema(def.items as Record<string, unknown>)
              : z.any();
            let a = z.array(items);
            if (def.minItems) a = a.min(def.minItems as number);
            if (def.maxItems) a = a.max(def.maxItems as number);
            return def.optional ? a.optional() : a;
          }
          case "object": {
            const shape: Record<string, z.ZodTypeAny> = {};
            const props = def.properties as Record<string, Record<string, unknown>> | undefined;
            if (props) {
              for (const [key, propDef] of Object.entries(props)) {
                shape[key] = buildZodSchema(propDef);
              }
            }
            const o = z.object(shape);
            return def.optional ? o.optional() : o;
          }
          default:
            return z.any();
        }
      };

      try {
        const zodSchema = buildZodSchema(schema as Record<string, unknown>);
        const result = zodSchema.safeParse(data);
        if (result.success) {
          return { valid: true, data: result.data };
        }
        return {
          valid: false,
          errors: result.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        };
      } catch (e) {
        return { valid: false, error: (e as Error).message };
      }
    },
  },
  {
    name: "validate_phone",
    description: "Validate phone number format",
    category: "validation",
    inputSchema: {
      type: "object",
      properties: {
        phone: { type: "string", description: "Phone number" },
        locale: { type: "string", description: "Locale (e.g., 'en-US', 'fr-FR')" },
      },
      required: ["phone"],
    },
    handler: ({ phone, locale }) => ({
      valid: validator.isMobilePhone(
        phone as string,
        (locale as validator.MobilePhoneLocale) || "any",
      ),
    }),
  },
  {
    name: "validate_date",
    description: "Validate date string format",
    category: "validation",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date string" },
        format: { type: "string", description: "Expected format (ISO8601 by default)" },
      },
      required: ["date"],
    },
    handler: ({ date, format }) => {
      if (format === "ISO8601" || !format) {
        return { valid: validator.isISO8601(date as string) };
      }
      return { valid: validator.isDate(date as string, { format: format as string }) };
    },
  },
];
