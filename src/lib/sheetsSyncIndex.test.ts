import { describe, expect, it } from "vitest";
import {
  collectPagedSyncIndex,
  isPartialSyncIndex,
  pickSyncLeadIndexFields,
  SYNC_INDEX_BATCH_SIZE,
} from "./sheetsSyncIndex";

describe("Sheets sync index helpers", () => {
  it("processes more than the 100-lead dashboard window", () => {
    const docs = Array.from({ length: 150 }, (_, index) => ({
      id: String(1000 + index),
      data: {
        id: 1000 + index,
        name: `Lead ${index}`,
        phone: `0400000${String(index).padStart(3, "0")}`,
        suburb: "Perth",
        status: "DQ",
        dqRep: 1,
        region: "perth",
        houseNum: "10",
        street: "Hay Street",
        postcode: "6000",
        ignoredLargeField: "not retained",
      },
    }));

    const index = docs.map((doc) => pickSyncLeadIndexFields(doc.id, doc.data));

    expect(index).toHaveLength(150);
    expect(index[149].phone).toBe("0400000149");
    expect(index[0].region).toBe("perth");
    expect(index[0].address).toBe("10 Hay Street Perth 6000");
    expect(index[0]).not.toHaveProperty("ignoredLargeField");
    expect(isPartialSyncIndex(index.length, 150)).toBe(false);
  });

  it("collects a full paged CRM sync index beyond the dashboard limit", async () => {
    const docs = Array.from({ length: 1200 }, (_, index) => ({
      id: String(2000 + index),
      data: {
        id: 2000 + index,
        leadId: `lead-${index}`,
        name: `Lead ${index}`,
        phone: `0401${String(index).padStart(6, "0")}`,
        phoneRaw: `0401 ${String(index).padStart(6, "0")}`,
        email: `lead${index}@example.test`,
        houseNum: "12",
        street: "King Street",
        suburb: "Perth",
        postcode: "6000",
        status: index === 0 ? "Live" : "DQ",
        dqRep: 1,
        assignedRep: "Rep One",
        owner: "Owner One",
        repName: "Rep One",
        updatedAt: 1000 + index,
        callHistory: [{ notes: "large field omitted" }],
      },
    }));
    const progress: number[] = [];

    const index = await collectPagedSyncIndex(
      docs.length,
      async (cursor) => {
        const start = typeof cursor === "number" ? cursor : 0;
        const page = docs.slice(start, start + SYNC_INDEX_BATCH_SIZE);
        return {
          entries: page.map((doc) => pickSyncLeadIndexFields(doc.id, doc.data)),
          nextCursor: start + page.length,
          done: start + page.length >= docs.length,
        };
      },
      (loadedCount) => progress.push(loadedCount),
    );

    expect(index).toHaveLength(1200);
    expect(progress).toEqual([500, 1000, 1200]);
    expect(index[0].status).toBe("Booked");
    expect(index[1199].phone).toBe("0401001199");
    expect(index[1199].address).toBe("12 King Street Perth 6000");
    expect(index[1199]).not.toHaveProperty("callHistory");
    expect(isPartialSyncIndex(index.length, docs.length)).toBe(false);
  });
});
