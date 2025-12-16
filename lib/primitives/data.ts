/**
 * Fake data generation tools
 *
 * Uses @faker-js/faker for realistic test data.
 *
 * @module lib/primitives/data
 */

import { faker } from "@faker-js/faker";
import type { MiniTool } from "./types.ts";

// Note: In faker v9, locale is set via seed or at import time
// We'll use the default faker instance which uses en locale

export const dataTools: MiniTool[] = [
  {
    name: "data_person",
    description: "Generate fake person data (name, email, phone, job, etc.)",
    category: "data",
    inputSchema: {
      type: "object",
      properties: {
        sex: { type: "string", enum: ["male", "female"], description: "Gender for name" },
      },
    },
    handler: ({ sex }) => {
      const sexOpt = sex as "male" | "female" | undefined;
      return {
        firstName: faker.person.firstName(sexOpt),
        lastName: faker.person.lastName(sexOpt),
        fullName: faker.person.fullName({ sex: sexOpt }),
        email: faker.internet.email(),
        phone: faker.phone.number(),
        jobTitle: faker.person.jobTitle(),
        jobArea: faker.person.jobArea(),
        bio: faker.person.bio(),
      };
    },
  },
  {
    name: "data_address",
    description: "Generate fake address data",
    category: "data",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: () => {
      return {
        street: faker.location.streetAddress(),
        city: faker.location.city(),
        state: faker.location.state(),
        zipCode: faker.location.zipCode(),
        country: faker.location.country(),
        countryCode: faker.location.countryCode(),
        latitude: faker.location.latitude(),
        longitude: faker.location.longitude(),
      };
    },
  },
  {
    name: "data_company",
    description: "Generate fake company data",
    category: "data",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: () => {
      return {
        name: faker.company.name(),
        catchPhrase: faker.company.catchPhrase(),
        buzzPhrase: faker.company.buzzPhrase(),
        industry: faker.commerce.department(),
      };
    },
  },
  {
    name: "data_lorem",
    description: "Generate lorem ipsum text",
    category: "data",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["words", "sentences", "paragraphs", "lines"],
          description: "Type of text",
        },
        count: { type: "number", description: "Number of units (default: 3)" },
      },
    },
    handler: ({ type = "sentences", count = 3 }) => {
      const cnt = count as number;
      switch (type) {
        case "words":
          return faker.lorem.words(cnt);
        case "sentences":
          return faker.lorem.sentences(cnt);
        case "paragraphs":
          return faker.lorem.paragraphs(cnt);
        case "lines":
          return faker.lorem.lines(cnt);
        default:
          return faker.lorem.sentences(cnt);
      }
    },
  },
  {
    name: "data_internet",
    description: "Generate fake internet data (username, url, ip, etc.)",
    category: "data",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["email", "username", "url", "ip", "ipv6", "mac", "userAgent", "password"],
          description: "Type of data",
        },
      },
      required: ["type"],
    },
    handler: ({ type }) => {
      switch (type) {
        case "email":
          return faker.internet.email();
        case "username":
          return faker.internet.userName();
        case "url":
          return faker.internet.url();
        case "ip":
          return faker.internet.ip();
        case "ipv6":
          return faker.internet.ipv6();
        case "mac":
          return faker.internet.mac();
        case "userAgent":
          return faker.internet.userAgent();
        case "password":
          return faker.internet.password();
        default:
          return faker.internet.email();
      }
    },
  },
  {
    name: "data_finance",
    description: "Generate fake financial data",
    category: "data",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["amount", "currency", "creditCard", "iban", "bic", "bitcoin"],
          description: "Type of financial data",
        },
      },
      required: ["type"],
    },
    handler: ({ type }) => {
      switch (type) {
        case "amount":
          return faker.finance.amount();
        case "currency":
          return faker.finance.currency();
        case "creditCard":
          return {
            number: faker.finance.creditCardNumber(),
            issuer: faker.finance.creditCardIssuer(),
            cvv: faker.finance.creditCardCVV(),
          };
        case "iban":
          return faker.finance.iban();
        case "bic":
          return faker.finance.bic();
        case "bitcoin":
          return faker.finance.bitcoinAddress();
        default:
          return faker.finance.amount();
      }
    },
  },
  {
    name: "data_date",
    description: "Generate fake dates",
    category: "data",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["past", "future", "recent", "soon", "birthdate", "between"],
          description: "Type of date",
        },
        years: { type: "number", description: "Years range (for past/future)" },
        from: { type: "string", description: "Start date (for between)" },
        to: { type: "string", description: "End date (for between)" },
      },
    },
    handler: ({ type = "recent", years = 1, from, to }) => {
      switch (type) {
        case "past":
          return faker.date.past({ years: years as number }).toISOString();
        case "future":
          return faker.date.future({ years: years as number }).toISOString();
        case "recent":
          return faker.date.recent().toISOString();
        case "soon":
          return faker.date.soon().toISOString();
        case "birthdate":
          return faker.date.birthdate().toISOString();
        case "between":
          return faker.date
            .between({ from: from as string, to: to as string })
            .toISOString();
        default:
          return faker.date.recent().toISOString();
      }
    },
  },
  {
    name: "data_image",
    description: "Generate fake image URLs",
    category: "data",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["avatar", "url", "urlLoremFlickr", "dataUri"],
          description: "Type of image",
        },
        width: { type: "number", description: "Width in pixels" },
        height: { type: "number", description: "Height in pixels" },
        category: { type: "string", description: "Category (for urlLoremFlickr)" },
      },
    },
    handler: ({ type = "url", width = 640, height = 480, category }) => {
      switch (type) {
        case "avatar":
          return faker.image.avatar();
        case "url":
          return faker.image.url({ width: width as number, height: height as number });
        case "urlLoremFlickr":
          return faker.image.urlLoremFlickr({
            width: width as number,
            height: height as number,
            category: category as string,
          });
        case "dataUri":
          return faker.image.dataUri({ width: width as number, height: height as number });
        default:
          return faker.image.url();
      }
    },
  },
];
