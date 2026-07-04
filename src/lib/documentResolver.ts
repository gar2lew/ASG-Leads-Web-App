import type { Lead, Rep } from "../types";
import type { DocumentNode, DocumentTemplateSchema, TemplateFieldDefinition } from "./documentSchema";

export interface DocumentResolutionContext {
  lead?: Lead | null;
  rep?: Rep | null;
  project?: Record<string, unknown> | null;
  deal?: Record<string, unknown> | null;
  transaction?: Record<string, unknown> | null;
  financials?: Record<string, unknown> | null;
  lender?: Record<string, unknown> | null;
  values?: Record<string, unknown>;
  now?: Date;
}

export interface ResolvedField {
  key: string;
  value: unknown;
  rendered: string;
  found: boolean;
  source?: string;
}

const AUTO_FIELD_ALIASES: Record<string, string> = {
  leadName: "lead.name",
  leadPhone: "lead.phone",
  leadEmail: "lead.email",
  leadAddress: "lead.address",
  leadSuburb: "lead.suburb",
  leadPostcode: "lead.postcode",
  leadOwnership: "lead.ownership",
  repName: "rep.name",
  today: "system.today",
};

export function resolveField(
  key: string,
  context: DocumentResolutionContext,
  definition?: TemplateFieldDefinition,
): ResolvedField {
  const normalizedKey = AUTO_FIELD_ALIASES[key] ?? key;
  const directValue = context.values?.[key] ?? context.values?.[normalizedKey];
  if (directValue !== undefined && directValue !== null && directValue !== "") {
    return renderResolvedValue(key, directValue, definition, "values");
  }

  const value = resolveKnownField(normalizedKey, context);
  if (value !== undefined && value !== null && value !== "") {
    return renderResolvedValue(key, value, definition, normalizedKey.split(".")[0]);
  }

  const fallback = definition?.fallback ?? "";
  return { key, value: fallback, rendered: fallback, found: false, source: definition?.source };
}

export function resolveTemplateFields(
  schema: DocumentTemplateSchema,
  context: DocumentResolutionContext,
): Record<string, ResolvedField> {
  return Object.fromEntries(
    schema.fields.map((field) => [field.key, resolveField(field.key, context, field)]),
  );
}

export function renderDocumentNodes(nodes: DocumentNode[], context: DocumentResolutionContext): string {
  return nodes.map((node) => renderDocumentNode(node, context)).join("");
}

export function evaluateCondition(
  fieldKey: string,
  context: DocumentResolutionContext,
  operator: "exists" | "not-exists" | "equals" | "not-equals" | "truthy" | "falsy" = "truthy",
  expected?: string | number | boolean,
): boolean {
  const resolved = resolveField(fieldKey, context);
  const hasValue = resolved.found && resolved.rendered.trim() !== "";

  switch (operator) {
    case "exists":
      return hasValue;
    case "not-exists":
      return !hasValue;
    case "equals":
      return String(resolved.value) === String(expected);
    case "not-equals":
      return String(resolved.value) !== String(expected);
    case "falsy":
      return !resolved.value;
    case "truthy":
    default:
      return Boolean(resolved.value);
  }
}

export function amountToWords(amount: number): string {
  if (!Number.isFinite(amount)) return "";
  const rounded = Math.round(amount);
  if (rounded === 0) return "zero";

  const units = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

  const underThousand = (n: number): string => {
    if (n < 20) return units[n];
    if (n < 100) return `${tens[Math.floor(n / 10)]}${n % 10 ? `-${units[n % 10]}` : ""}`;
    return `${units[Math.floor(n / 100)]} hundred${n % 100 ? ` and ${underThousand(n % 100)}` : ""}`;
  };

  const parts: string[] = [];
  const scales: Array<[number, string]> = [
    [1_000_000_000, "billion"],
    [1_000_000, "million"],
    [1_000, "thousand"],
  ];
  let remainder = rounded;

  for (const [scale, label] of scales) {
    const count = Math.floor(remainder / scale);
    if (count > 0) {
      parts.push(`${underThousand(count)} ${label}`);
      remainder %= scale;
    }
  }

  if (remainder > 0) parts.push(underThousand(remainder));
  return parts.join(" ");
}

function renderDocumentNode(node: DocumentNode, context: DocumentResolutionContext): string {
  if (node.type === "text") return node.text;
  if (node.type === "placeholder") return resolveField(node.fieldKey, context, { key: node.fieldKey, label: node.fieldKey, kind: "text", fallback: node.fallback }).rendered;
  if (node.type === "conditional") {
    const condition = node.condition;
    return evaluateCondition(condition.fieldKey, context, condition.operator, condition.value)
      ? renderDocumentNodes(node.children, context)
      : "";
  }
  if (node.type === "repeat") {
    const collection = resolveKnownField(node.section.collectionKey, context);
    if (!Array.isArray(collection) || collection.length === 0) return node.section.emptyFallback ?? "";
    return collection
      .map((item) =>
        renderDocumentNodes(node.children, {
          ...context,
          values: { ...context.values, [node.section.itemAlias ?? "item"]: item },
        }),
      )
      .join("");
  }
  return "";
}

function renderResolvedValue(
  key: string,
  value: unknown,
  definition: TemplateFieldDefinition | undefined,
  source: string,
): ResolvedField {
  return {
    key,
    value,
    rendered: formatValue(value, definition),
    found: true,
    source,
  };
}

function formatValue(value: unknown, definition?: TemplateFieldDefinition): string {
  if (value === undefined || value === null) return "";
  if (definition?.kind === "currency" && typeof value === "number") {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
  }
  if (definition?.kind === "date") {
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-AU");
  }
  if (definition?.kind === "computed" && definition.key === "amount_words" && typeof value === "number") {
    return amountToWords(value);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function resolveKnownField(key: string, context: DocumentResolutionContext): unknown {
  if (key === "system.today") return (context.now ?? new Date()).toLocaleDateString("en-AU");
  if (key === "amount_words") {
    const amount = context.financials?.amount ?? context.financials?.total ?? context.values?.amount;
    return typeof amount === "number" ? amountToWords(amount) : amount;
  }
  if (key === "lead.address") {
    const lead = context.lead;
    return [lead?.houseNum, lead?.street, lead?.suburb, lead?.postcode].filter(Boolean).join(" ");
  }

  const [scope, ...path] = key.split(".");
  const root = getScopeValue(scope, context);
  return path.reduce<unknown>((acc, part) => {
    if (acc === undefined || acc === null) return undefined;
    if (typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[part];
  }, root);
}

function getScopeValue(scope: string, context: DocumentResolutionContext): unknown {
  if (scope === "lead") return context.lead;
  if (scope === "rep") return context.rep;
  if (scope === "project") return context.project;
  if (scope === "deal") return context.deal;
  if (scope === "transaction") return context.transaction;
  if (scope === "financials") return context.financials;
  if (scope === "lender") return context.lender;
  return context.values?.[scope];
}
