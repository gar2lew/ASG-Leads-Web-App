import type { DocumentNode } from "./documentSchema";

export type StructuredDocumentNodeName =
  | "documentPlaceholder"
  | "documentConditionalBlock"
  | "documentRepeatingSection";

export interface TiptapExtensionBlueprint {
  name: StructuredDocumentNodeName;
  group: "inline" | "block";
  atom?: boolean;
  attributes: Record<string, string | null>;
}

export const STRUCTURED_DOCUMENT_TIPTAP_EXTENSIONS: TiptapExtensionBlueprint[] = [
  {
    name: "documentPlaceholder",
    group: "inline",
    atom: true,
    attributes: {
      fieldKey: null,
      fallback: "",
    },
  },
  {
    name: "documentConditionalBlock",
    group: "block",
    attributes: {
      fieldKey: null,
      operator: "truthy",
      value: "",
    },
  },
  {
    name: "documentRepeatingSection",
    group: "block",
    attributes: {
      collectionKey: null,
      itemAlias: "item",
      emptyFallback: "",
    },
  },
];

export interface TiptapJsonNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapJsonNode[];
}

export function documentNodeToTiptapJson(node: DocumentNode): TiptapJsonNode {
  if (node.type === "text") return { type: "text", text: node.text };
  if (node.type === "placeholder") {
    return {
      type: "documentPlaceholder",
      attrs: { fieldKey: node.fieldKey, fallback: node.fallback ?? "" },
    };
  }
  if (node.type === "conditional") {
    return {
      type: "documentConditionalBlock",
      attrs: {
        fieldKey: node.condition.fieldKey,
        operator: node.condition.operator ?? "truthy",
        value: node.condition.value ?? "",
      },
      content: node.children.map(documentNodeToTiptapJson),
    };
  }
  return {
    type: "documentRepeatingSection",
    attrs: {
      collectionKey: node.section.collectionKey,
      itemAlias: node.section.itemAlias ?? "item",
      emptyFallback: node.section.emptyFallback ?? "",
    },
    content: node.children.map(documentNodeToTiptapJson),
  };
}

export function tiptapJsonToDocumentNode(node: TiptapJsonNode): DocumentNode | null {
  if (node.type === "text") return { type: "text", text: node.text ?? "" };
  if (node.type === "documentPlaceholder") {
    const fieldKey = String(node.attrs?.fieldKey ?? "");
    if (!fieldKey) return null;
    return { type: "placeholder", fieldKey, fallback: String(node.attrs?.fallback ?? "") };
  }
  if (node.type === "documentConditionalBlock") {
    const fieldKey = String(node.attrs?.fieldKey ?? "");
    if (!fieldKey) return null;
    return {
      type: "conditional",
      condition: {
        id: `condition_${fieldKey}`,
        fieldKey,
        operator: String(node.attrs?.operator ?? "truthy") as "truthy",
        value: node.attrs?.value as string | number | boolean | undefined,
      },
      children: (node.content ?? []).map(tiptapJsonToDocumentNode).filter((child): child is DocumentNode => Boolean(child)),
    };
  }
  if (node.type === "documentRepeatingSection") {
    const collectionKey = String(node.attrs?.collectionKey ?? "");
    if (!collectionKey) return null;
    return {
      type: "repeat",
      section: {
        id: `repeat_${collectionKey}`,
        collectionKey,
        itemAlias: String(node.attrs?.itemAlias ?? "item"),
        emptyFallback: String(node.attrs?.emptyFallback ?? ""),
      },
      children: (node.content ?? []).map(tiptapJsonToDocumentNode).filter((child): child is DocumentNode => Boolean(child)),
    };
  }
  return null;
}
