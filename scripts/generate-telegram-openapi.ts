#!/usr/bin/env bun
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type CustomSchema,
  type Field,
  getCustomSchema,
  type Method,
  type Object as TelegramObject,
} from "@gramio/schema-parser";

type JsonObject = Record<string, unknown>;
type RequestEncoding = "json" | "multipart";
type FieldOf<Type extends Field["type"]> = Extract<Field, { type: Type }>;

interface RequestSchemaContext {
  encoding: RequestEncoding;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = dirname(HERE);
const OUT_PATH = join(PKG_ROOT, "specs", "telegram-bot-api.openapi.json");
const TELEGRAM_DOCS_URL = "https://core.telegram.org/bots/api";

const isInputFileReference = (field: Field): boolean =>
  field.type === "reference" && field.reference.name === "InputFile";

const hasNonFileVariant = (field: Field): boolean => {
  if (isInputFileReference(field)) {
    return false;
  }

  if (field.type !== "one_of") {
    return true;
  }

  return field.variants.some(hasNonFileVariant);
};

const requiresJsonIncompatibleUpload = (field: Field): boolean => {
  if (isInputFileReference(field)) {
    return true;
  }

  if (field.type === "one_of") {
    return !field.variants.some(hasNonFileVariant);
  }

  if (field.type === "array") {
    return requiresJsonIncompatibleUpload(field.arrayOf);
  }

  return false;
};

const requiredFields = (fields: Field[]): string[] =>
  fields.filter((field) => field.required).map((field) => field.key);

const withDescription = (
  schema: JsonObject,
  description: string | undefined
): JsonObject => {
  if (!description) {
    return schema;
  }

  if ("$ref" in schema) {
    return { description, allOf: [schema] };
  }

  return { ...schema, description };
};

const integerFieldToSchema = (field: FieldOf<"integer">): JsonObject =>
  withDescription(
    {
      type: "integer",
      ...(field.enum ? { enum: field.enum } : {}),
      ...(field.default === undefined ? {} : { default: field.default }),
      ...(field.min === undefined ? {} : { minimum: field.min }),
      ...(field.max === undefined ? {} : { maximum: field.max }),
    },
    field.description
  );

const floatFieldToSchema = (field: FieldOf<"float">): JsonObject =>
  withDescription(
    {
      type: "number",
      ...(field.enum ? { enum: field.enum } : {}),
      ...(field.default === undefined ? {} : { default: field.default }),
      ...(field.min === undefined ? {} : { minimum: field.min }),
      ...(field.max === undefined ? {} : { maximum: field.max }),
    },
    field.description
  );

const stringFieldToSchema = (field: FieldOf<"string">): JsonObject =>
  withDescription(
    {
      type: "string",
      ...(field.const === undefined ? {} : { enum: [field.const] }),
      ...(field.enum ? { enum: field.enum } : {}),
      ...(field.default === undefined ? {} : { default: field.default }),
      ...(field.minLen === undefined ? {} : { minLength: field.minLen }),
      ...(field.maxLen === undefined ? {} : { maxLength: field.maxLen }),
      ...(field.semanticType
        ? { "x-telegram-semantic-type": field.semanticType }
        : {}),
    },
    field.description
  );

const booleanFieldToSchema = (field: FieldOf<"boolean">): JsonObject =>
  withDescription(
    {
      type: "boolean",
      ...(field.const === undefined ? {} : { enum: [field.const] }),
    },
    field.description
  );

const referenceFieldToSchema = (
  field: FieldOf<"reference">,
  context: RequestSchemaContext
): JsonObject => {
  if (field.reference.name === "InputFile") {
    return withDescription(
      context.encoding === "multipart"
        ? { type: "string", format: "binary" }
        : { type: "string" },
      field.description
    );
  }

  return withDescription(
    { $ref: `#/components/schemas/${field.reference.name}` },
    field.description
  );
};

const uniqueSchemas = (schemas: JsonObject[]): JsonObject[] =>
  schemas.filter(
    (schema, index, allSchemas) =>
      allSchemas.findIndex(
        (candidate) => JSON.stringify(candidate) === JSON.stringify(schema)
      ) === index
  );

const oneOfFieldToSchema = (
  field: FieldOf<"one_of">,
  context: RequestSchemaContext
): JsonObject => {
  const variants = uniqueSchemas(
    field.variants.map((variant) => fieldToSchema(variant, context))
  );
  const schema = variants.length === 1 ? variants[0] : { oneOf: variants };

  return withDescription(schema ?? {}, field.description);
};

const fieldToSchema = (
  field: Field,
  context: RequestSchemaContext
): JsonObject => {
  switch (field.type) {
    case "integer":
      return integerFieldToSchema(field);
    case "float":
      return floatFieldToSchema(field);
    case "string":
      return stringFieldToSchema(field);
    case "boolean":
      return booleanFieldToSchema(field);
    case "array":
      return withDescription(
        {
          type: "array",
          items: fieldToSchema(field.arrayOf, context),
        },
        field.description
      );
    case "reference":
      return referenceFieldToSchema(field, context);
    case "one_of":
      return oneOfFieldToSchema(field, context);
    default:
      throw new Error(
        `Unsupported Telegram field type: ${field satisfies never}`
      );
  }
};

const objectToSchema = (object: TelegramObject): JsonObject => {
  const baseMetadata = {
    ...(object.description ? { description: object.description } : {}),
    ...(object.semanticType
      ? { "x-telegram-semantic-type": object.semanticType }
      : {}),
    externalDocs: {
      description: "Telegram Bot API reference",
      url: `${TELEGRAM_DOCS_URL}${object.anchor}`,
    },
  };

  switch (object.type) {
    case "fields": {
      const properties = Object.fromEntries(
        object.fields.map((field) => [
          field.key,
          fieldToSchema(field, { encoding: "json" }),
        ])
      );
      const required = requiredFields(object.fields);

      return {
        ...baseMetadata,
        type: "object",
        additionalProperties: false,
        properties,
        ...(required.length > 0 ? { required } : {}),
      };
    }
    case "oneOf":
      return {
        ...baseMetadata,
        oneOf: object.oneOf.map((field) =>
          fieldToSchema(field, { encoding: "json" })
        ),
      };
    case "enum":
      return {
        ...baseMetadata,
        type: "string",
        enum: [...object.values].sort((a, b) => a.localeCompare(b)),
      };
    case "file":
      return {
        ...baseMetadata,
        type: "string",
        format: "binary",
      };
    case "unknown":
      return {
        ...baseMetadata,
        type: "object",
        additionalProperties: false,
      };
    default:
      throw new Error(
        `Unsupported Telegram object type: ${object satisfies never}`
      );
  }
};

const buildObjectBodySchema = (
  fields: Field[],
  encoding: RequestEncoding
): JsonObject => {
  const properties = Object.fromEntries(
    fields.map((field) => [field.key, fieldToSchema(field, { encoding })])
  );
  const required = requiredFields(fields);

  return {
    type: "object",
    additionalProperties: false,
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
};

const methodSupportsJsonRequest = (method: Method): boolean =>
  method.parameters.every(
    (field) => !(field.required && requiresJsonIncompatibleUpload(field))
  );

const methodRequestBody = (method: Method): JsonObject | undefined => {
  if (method.parameters.length === 0) {
    return;
  }

  const content: JsonObject = {};

  if (methodSupportsJsonRequest(method)) {
    content["application/json"] = {
      schema: buildObjectBodySchema(method.parameters, "json"),
    };
  }

  if (method.hasMultipart) {
    content["multipart/form-data"] = {
      schema: buildObjectBodySchema(method.parameters, "multipart"),
    };
  }

  if (!method.hasMultipart) {
    content["application/x-www-form-urlencoded"] = {
      schema: buildObjectBodySchema(method.parameters, "json"),
    };
  }

  return { required: true, content };
};

const methodToOperation = (method: Method): JsonObject => {
  const requestBody = methodRequestBody(method);

  return {
    operationId: method.name,
    tags: ["Telegram Bot API"],
    ...(method.description ? { description: method.description } : {}),
    externalDocs: {
      description: "Telegram Bot API reference",
      url: `${TELEGRAM_DOCS_URL}${method.anchor}`,
    },
    ...(requestBody ? { requestBody } : {}),
    responses: {
      "200": {
        description: "Telegram API response",
        content: {
          "application/json": {
            schema: {
              allOf: [
                { $ref: "#/components/schemas/TelegramOkResponse" },
                {
                  type: "object",
                  required: ["result"],
                  properties: {
                    result: fieldToSchema(method.returns as Field, {
                      encoding: "json",
                    }),
                  },
                },
              ],
            },
          },
        },
      },
      default: {
        description: "Telegram API error response",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/TelegramErrorResponse" },
          },
        },
      },
    },
  };
};

const buildSchemas = (objects: TelegramObject[]): JsonObject => {
  const schemas = Object.fromEntries(
    [...objects]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((object) => [object.name, objectToSchema(object)])
  );

  return {
    TelegramOkResponse: {
      type: "object",
      required: ["ok"],
      properties: {
        ok: { type: "boolean", enum: [true] },
      },
    },
    TelegramErrorResponse: {
      type: "object",
      required: ["ok", "error_code", "description"],
      properties: {
        ok: { type: "boolean", enum: [false] },
        error_code: { type: "integer" },
        description: { type: "string" },
        parameters: { $ref: "#/components/schemas/ResponseParameters" },
      },
    },
    ...schemas,
  };
};

const buildOpenApiDocument = (schema: CustomSchema): JsonObject => {
  const apiVersion = `${schema.version.major}.${schema.version.minor}`;
  const releaseDate = `${schema.version.release_date.year}-${String(
    schema.version.release_date.month
  ).padStart(2, "0")}-${String(schema.version.release_date.day).padStart(
    2,
    "0"
  )}`;

  return {
    openapi: "3.0.3",
    info: {
      title: "Telegram Bot API",
      version: apiVersion,
      description:
        "Generated from the official Telegram Bot API documentation using @gramio/schema-parser.",
      "x-telegram-release-date": releaseDate,
    },
    externalDocs: {
      description: "Official Telegram Bot API documentation",
      url: TELEGRAM_DOCS_URL,
    },
    servers: [
      {
        url: "https://api.telegram.org/bot{botToken}",
        description:
          "Telegram Bot API endpoint. Substitute {botToken} with the token from BotFather.",
        variables: {
          botToken: {
            default: "<bot_token>",
            description: "Telegram bot token obtained from BotFather.",
          },
        },
        "x-telegram-token-location": "server-variable",
      },
    ],
    paths: Object.fromEntries(
      [...schema.methods]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((method) => [
          `/${method.name}`,
          { post: methodToOperation(method) },
        ])
    ),
    components: {
      schemas: buildSchemas(schema.objects),
    },
    tags: [
      {
        name: "Telegram Bot API",
        description: `Telegram Bot API ${apiVersion}, released ${releaseDate}.`,
      },
    ],
    "x-generator": "@gramio/schema-parser",
  };
};

const schema = await getCustomSchema();
const openApiDocument = buildOpenApiDocument(schema);

await mkdir(dirname(OUT_PATH), { recursive: true });
await writeFile(OUT_PATH, `${JSON.stringify(openApiDocument, null, 2)}\n`);

process.stdout.write(
  `Wrote Telegram Bot API ${schema.version.major}.${schema.version.minor} OpenAPI to ${OUT_PATH}\n`
);
