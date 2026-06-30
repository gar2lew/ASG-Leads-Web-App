import type { Lead } from "../types";
import { normalizeLeadStatusForWrite } from "./statusConfig";

export const SYNC_INDEX_BATCH_SIZE = 500;

export type SyncLeadIndexEntry = Pick<
  Lead,
  | "id"
  | "name"
  | "phone"
  | "phoneRaw"
  | "email"
  | "houseNum"
  | "street"
  | "suburb"
  | "postcode"
  | "status"
  | "dqRep"
  | "updatedAt"
> & {
  leadId?: string | number;
  address?: string;
  assignedRep?: string | number;
  owner?: string;
  repName?: string;
};

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function deriveAddress(data: Record<string, unknown>): string | undefined {
  const address = stringField(data.address);
  if (address) return address;

  const splitAddress = [data.houseNum, data.street, data.suburb, data.postcode].map(stringField).filter(Boolean).join(" ");
  return splitAddress || undefined;
}

export function pickSyncLeadIndexFields(docId: string, data: Record<string, unknown>): SyncLeadIndexEntry {
  const id = typeof data.id === "number" ? data.id : Number(docId);
  return {
    id,
    leadId: data.leadId as string | number | undefined,
    name: String(data.name ?? ""),
    phone: String(data.phone ?? ""),
    phoneRaw: data.phoneRaw as string | undefined,
    email: data.email as string | undefined,
    address: deriveAddress(data),
    houseNum: data.houseNum as string | undefined,
    street: data.street as string | undefined,
    suburb: String(data.suburb ?? ""),
    postcode: data.postcode as string | undefined,
    status: normalizeLeadStatusForWrite(String(data.status ?? "")),
    dqRep: typeof data.dqRep === "number" ? data.dqRep : Number(data.dqRep ?? 0),
    assignedRep: data.assignedRep as string | number | undefined,
    owner: data.owner as string | undefined,
    repName: data.repName as string | undefined,
    updatedAt: data.updatedAt as number | undefined,
  };
}

export function isPartialSyncIndex(loadedCount: number, totalCount: number): boolean {
  return totalCount > 0 && loadedCount < totalCount;
}

export type SyncIndexPage<T> = {
  entries: T[];
  nextCursor: unknown;
  done: boolean;
};

export async function collectPagedSyncIndex<T>(
  totalCount: number,
  loadPage: (cursor: unknown) => Promise<SyncIndexPage<T>>,
  onProgress?: (loadedCount: number, entries: T[]) => void,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: unknown = null;

  while (true) {
    const page = await loadPage(cursor);
    if (page.entries.length === 0) break;

    all.push(...page.entries);
    cursor = page.nextCursor;
    onProgress?.(all.length, [...all]);

    if (page.done || all.length >= totalCount) break;
  }

  return all;
}
