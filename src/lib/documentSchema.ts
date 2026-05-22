import type { FormTemplate, FormTemplateField } from "../types";

export type DocumentSchemaVersion = 1;

export type TemplateFieldKind =
  | "text"
  | "currency"
  | "date"
  | "entity-ref"
  | "computed"
  | "formatted"
  | "boolean"
  | "signature";

export type TemplateEntityScope =
  | "lead"
  | "project"
  | "deal"
  | "transaction"
  | "financials"
  | "lender"
  | "rep"
  | "system"
  | "template";

export interface TemplateFieldDefinition {
  key: string;
  label: string;
  kind: TemplateFieldKind;
  scope?: TemplateEntityScope;
  description?: string;
  required?: boolean;
  format?: string;
  fallback?: string;
  source?: string;
  legacyFieldId?: string;
}

export interface PlaceholderDefinition {
  key: string;
  label?: string;
  fieldKey: string;
  renderAs?: TemplateFieldKind;
  fallback?: string;
}

export interface ConditionalBlockDefinition {
  id: string;
  fieldKey: string;
  operator?: "exists" | "not-exists" | "equals" | "not-equals" | "truthy" | "falsy";
  value?: string | number | boolean;
}

export interface RepeatingSectionDefinition {
  id: string;
  collectionKey: string;
  itemAlias?: string;
  emptyFallback?: string;
}

export interface DocumentMetadata {
  title: string;
  description?: string;
  templateType: "builder" | "pdf" | "html" | "email" | "docx" | "csv" | "xlsx";
  createdBy?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface TemplateVersionMetadata {
  version: number;
  schemaVersion: DocumentSchemaVersion;
  migratedFrom?: "legacy-form-template" | "schema-editor";
  createdAt: number;
  createdBy?: string;
  note?: string;
}

export interface DocumentTextNode {
  type: "text";
  text: string;
}

export interface DocumentPlaceholderNode {
  type: "placeholder";
  fieldKey: string;
  fallback?: string;
}

export interface DocumentConditionalNode {
  type: "conditional";
  condition: ConditionalBlockDefinition;
  children: DocumentNode[];
}

export interface DocumentRepeatingNode {
  type: "repeat";
  section: RepeatingSectionDefinition;
  children: DocumentNode[];
}

export type DocumentNode =
  | DocumentTextNode
  | DocumentPlaceholderNode
  | DocumentConditionalNode
  | DocumentRepeatingNode;

export interface DocumentTemplateSchema {
  schemaVersion: DocumentSchemaVersion;
  metadata: DocumentMetadata;
  version: TemplateVersionMetadata;
  fields: TemplateFieldDefinition[];
  placeholders: PlaceholderDefinition[];
  conditionals: ConditionalBlockDefinition[];
  repeats: RepeatingSectionDefinition[];
  content: DocumentNode[];
}

export type PlaceholderToken =
  | { type: "text"; value: string }
  | { type: "placeholder"; key: string; raw: string };

const PLACEHOLDER_RE = /<<\s*([a-zA-Z0-9_.-]+)\s*>>/g;

export function parsePlaceholderText(input: string): PlaceholderToken[] {
  const tokens: PlaceholderToken[] = [];
  let lastIndex = 0;

  for (const match of input.matchAll(PLACEHOLDER_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      tokens.push({ type: "text", value: input.slice(lastIndex, index) });
    }
    tokens.push({ type: "placeholder", key: match[1], raw: match[0] });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < input.length) {
    tokens.push({ type: "text", value: input.slice(lastIndex) });
  }

  return tokens;
}

export function textToDocumentNodes(input: string): DocumentNode[] {
  return parsePlaceholderText(input).map((token) =>
    token.type === "text"
      ? { type: "text", text: token.value }
      : { type: "placeholder", fieldKey: token.key, fallback: token.raw },
  );
}

export function createPlaceholderDefinition(field: TemplateFieldDefinition): PlaceholderDefinition {
  return {
    key: field.key,
    fieldKey: field.key,
    label: field.label,
    renderAs: field.kind,
    fallback: field.fallback,
  };
}

export function buildLegacyFormTemplateSchema(template: FormTemplate): DocumentTemplateSchema {
  const now = template.updatedAt || template.createdAt || Date.now();
  const fields = template.fields.map(formFieldToSchemaField);

  return {
    schemaVersion: 1,
    metadata: {
      title: template.name,
      description: template.description,
      templateType: template.type ?? "builder",
      createdBy: template.createdBy,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    },
    version: {
      version: template.schema?.version.version ?? template.version ?? 1,
      schemaVersion: 1,
      migratedFrom: "legacy-form-template",
      createdAt: now,
      createdBy: template.createdBy,
    },
    fields,
    placeholders: fields.map(createPlaceholderDefinition),
    conditionals: [],
    repeats: [],
    content: fields.map((field) => ({ type: "placeholder", fieldKey: field.key, fallback: field.fallback })),
  };
}

export function formFieldToSchemaField(field: FormTemplateField): TemplateFieldDefinition {
  return {
    key: field.autoFill ?? field.id,
    label: field.label || field.id,
    kind: formFieldTypeToSchemaKind(field.type),
    required: field.required,
    fallback: "",
    legacyFieldId: field.id,
    source: field.autoFill ? "legacy-autofill" : "legacy-form-field",
  };
}

export function formFieldTypeToSchemaKind(type: FormTemplateField["type"]): TemplateFieldKind {
  if (type === "date") return "date";
  if (type === "checkbox") return "boolean";
  if (type === "signature") return "signature";
  return "text";
}

export function normalizeDocumentSchema(template: FormTemplate): DocumentTemplateSchema {
  return template.schema?.schemaVersion === 1 ? template.schema : buildLegacyFormTemplateSchema(template);
}

export function serializeDocumentSchema(schema: DocumentTemplateSchema): string {
  return JSON.stringify(schema);
}

export function deserializeDocumentSchema(raw: string): DocumentTemplateSchema | null {
  try {
    const parsed = JSON.parse(raw) as Partial<DocumentTemplateSchema>;
    if (parsed.schemaVersion !== 1 || !parsed.metadata || !Array.isArray(parsed.fields)) return null;
    return parsed as DocumentTemplateSchema;
  } catch {
    return null;
  }
}
