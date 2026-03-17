/**
 * Form Viewer UI for MCP Apps
 *
 * Dynamic form generator from JSON Schema with:
 * - Auto-generated fields from schema
 * - Validation
 * - Submit handling
 *
 * @module lib/std/src/ui/form-viewer
 */

import { render } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { cx } from "../../components/utils";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import * as Checkbox from "../../components/ui/checkbox";
import "../../global.css";

// ============================================================================
// Types
// ============================================================================

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  title?: string;
  description?: string;
  enum?: unknown[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
}

interface FormData {
  schema: JsonSchema;
  values?: Record<string, unknown>;
  title?: string;
  submitLabel?: string;
}

interface ContentItem {
  type: string;
  text?: string;
}

// ============================================================================
// MCP App Connection
// ============================================================================

const app = new App({ name: "Form Viewer", version: "1.0.0" });
let appConnected = false;

function notifyModel(event: string, data: Record<string, unknown>) {
  if (!appConnected) return;
  app.updateModelContext({
    content: [{ type: "text", text: `User ${event}: ${JSON.stringify(data)}` }],
    structuredContent: { event, ...data },
  });
}

// ============================================================================
// Styles
// ============================================================================

const inputErrorClass = "border-red-500 focus:border-red-500 focus:ring-red-500/20";

const textareaClass = cx(
  "p-2 border border-border-default rounded-md bg-bg-canvas text-fg-default text-sm",
  "outline-none resize-y focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
);

const selectClass = cx(
  "p-2 border border-border-default rounded-md bg-bg-canvas text-fg-default text-sm",
  "outline-none cursor-pointer focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
);

// ============================================================================
// Field Components
// ============================================================================

function TextField({
  name,
  schema,
  value,
  onChange,
  error,
}: {
  name: string;
  schema: JsonSchema;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const isTextarea = schema.maxLength && schema.maxLength > 100;

  return (
    <div className="flex flex-col gap-1">
      <label className="font-medium text-fg-default flex flex-col gap-0.5">
        {schema.title || name}
        {schema.description && (
          <span className="text-xs text-fg-muted font-normal">{schema.description}</span>
        )}
      </label>
      {isTextarea ? (
        <textarea
          className={cx(textareaClass, error && inputErrorClass)}
          value={value}
          onChange={(e) => onChange((e.target as HTMLTextAreaElement).value)}
          placeholder={schema.default as string || ""}
          rows={4}
        />
      ) : (
        <Input
          type={schema.format === "email" ? "email" : schema.format === "uri" ? "url" : "text"}
          value={value}
          onChange={(e) => onChange((e.target as HTMLInputElement).value)}
          placeholder={schema.default as string || ""}
          minLength={schema.minLength}
          maxLength={schema.maxLength}
          pattern={schema.pattern}
          className={error ? inputErrorClass : undefined}
        />
      )}
      {error && <div className="text-xs text-red-600 dark:text-red-400">{error}</div>}
    </div>
  );
}

function NumberField({
  name,
  schema,
  value,
  onChange,
  error,
}: {
  name: string;
  schema: JsonSchema;
  value: number | "";
  onChange: (value: number | "") => void;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="font-medium text-fg-default flex flex-col gap-0.5">
        {schema.title || name}
        {schema.description && <span className="text-xs text-fg-muted font-normal">{schema.description}</span>}
      </label>
      <Input
        type="number"
        value={value}
        onChange={(e) => {
          const v = (e.target as HTMLInputElement).value;
          onChange(v === "" ? "" : Number(v));
        }}
        min={schema.minimum}
        max={schema.maximum}
        placeholder={schema.default !== undefined ? String(schema.default) : ""}
        className={error ? inputErrorClass : undefined}
      />
      {error && <div className="text-xs text-red-600 dark:text-red-400">{error}</div>}
    </div>
  );
}

function BooleanField({
  name,
  schema,
  value,
  onChange,
}: {
  name: string;
  schema: JsonSchema;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Checkbox.Root
        checked={value}
        onCheckedChange={(details) => onChange(details.checked === true)}
      >
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Checkbox.Label>{schema.title || name}</Checkbox.Label>
        <Checkbox.HiddenInput />
      </Checkbox.Root>
      {schema.description && <div className="text-xs text-fg-muted">{schema.description}</div>}
    </div>
  );
}

function SelectField({
  name,
  schema,
  value,
  onChange,
  error,
}: {
  name: string;
  schema: JsonSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="font-medium text-fg-default flex flex-col gap-0.5">
        {schema.title || name}
        {schema.description && <span className="text-xs text-fg-muted font-normal">{schema.description}</span>}
      </label>
      <select
        className={cx(selectClass, error && inputErrorClass)}
        value={String(value)}
        onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
      >
        <option value="">Select...</option>
        {schema.enum?.map((opt) => (
          <option key={String(opt)} value={String(opt)}>
            {String(opt)}
          </option>
        ))}
      </select>
      {error && <div className="text-xs text-red-600 dark:text-red-400">{error}</div>}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function FormViewer() {
  const [formData, setFormData] = useState<FormData | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    app.connect().then(() => {
      appConnected = true;
      console.log("[form-viewer] Connected to MCP host");
    }).catch(() => {
      console.log("[form-viewer] No MCP host (standalone mode)");
    });

    app.ontoolresult = (result: { content?: ContentItem[] }) => {
      setLoading(false);
      try {
        const textContent = result.content?.find((c) => c.type === "text") as ContentItem | undefined;
        if (!textContent?.text) return;

        const data = JSON.parse(textContent.text) as FormData;
        setFormData(data);
        setValues(data.values || getDefaultValues(data.schema));
        setErrors({});
        setSubmitted(false);
      } catch (e) {
        console.error("[form-viewer] Parse error:", e);
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  const handleChange = useCallback((name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    notifyModel("change", { field: name, value });
  }, []);

  const handleSubmit = useCallback((e: Event) => {
    e.preventDefault();
    if (!formData?.schema.properties) return;

    const newErrors: Record<string, string> = {};
    const required = formData.schema.required || [];

    for (const [name, schema] of Object.entries(formData.schema.properties)) {
      const value = values[name];
      if (required.includes(name) && (value === undefined || value === "" || value === null)) {
        newErrors[name] = "This field is required";
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitted(true);
    notifyModel("submit", { values });
  }, [formData, values]);

  if (loading) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas max-w-[500px]">
        <div className="p-10 text-center text-fg-muted">Loading form...</div>
      </div>
    );
  }

  if (!formData?.schema.properties) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas max-w-[500px]">
        <div className="p-10 text-center text-fg-muted">No form schema provided</div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas max-w-[500px]">
        <div className="flex items-center gap-2 p-4 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 rounded-md">
          <div className="text-sm font-bold">OK</div>
          Form submitted successfully
        </div>
      </div>
    );
  }

  const properties = formData.schema.properties;
  const required = formData.schema.required || [];

  return (
    <div className="p-4 font-sans text-sm text-fg-default bg-bg-canvas max-w-[500px]">
      {formData.title && (
        <h2 className="text-lg font-semibold mb-4 text-fg-default">
          {formData.title}
        </h2>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {Object.entries(properties).map(([name, schema]) => {
          const isRequired = required.includes(name);
          const value = values[name];
          const error = errors[name];

          if (schema.enum) {
            return (
              <SelectField
                key={name}
                name={isRequired ? `${name} *` : name}
                schema={schema}
                value={value}
                onChange={(v) => handleChange(name, v)}
                error={error}
              />
            );
          }

          switch (schema.type) {
            case "boolean":
              return (
                <BooleanField
                  key={name}
                  name={name}
                  schema={schema}
                  value={Boolean(value)}
                  onChange={(v) => handleChange(name, v)}
                />
              );
            case "number":
            case "integer":
              return (
                <NumberField
                  key={name}
                  name={isRequired ? `${name} *` : name}
                  schema={schema}
                  value={value as number | ""}
                  onChange={(v) => handleChange(name, v)}
                  error={error}
                />
              );
            default:
              return (
                <TextField
                  key={name}
                  name={isRequired ? `${name} *` : name}
                  schema={schema}
                  value={String(value || "")}
                  onChange={(v) => handleChange(name, v)}
                  error={error}
                />
              );
          }
        })}

        <Button type="submit" className="mt-2">
          {formData.submitLabel || "Submit"}
        </Button>
      </form>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function getDefaultValues(schema: JsonSchema): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  if (schema.properties) {
    for (const [name, prop] of Object.entries(schema.properties)) {
      if (prop.default !== undefined) {
        values[name] = prop.default;
      } else if (prop.type === "boolean") {
        values[name] = false;
      }
    }
  }
  return values;
}

// ============================================================================
// Mount
// ============================================================================

render(<FormViewer />, document.getElementById("app")!);
