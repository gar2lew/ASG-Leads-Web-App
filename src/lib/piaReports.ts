import { db, storage } from "./firebase";
import { addDoc, collection, query, where, getDocs } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

export interface PIAReport {
  schemaVersion: number;
  consultantName: string;
  clientName: string;
  clientId: string | null;
  clientGroupId: string | null;
  label: string;
  inputs: Record<string, unknown>;
  pdfUrl: string | null;
  createdAt: number;
  source: string;
}

export async function savePIAReport(input: {
  consultantName?: string;
  clientName?: string;
  clientId?: string | null;
  clientGroupId?: string | null;
  label?: string;
  inputs?: Record<string, unknown>;
  pdfUrl?: string | null;
  createdAt?: number;
}): Promise<string | null> {
  const doc = {
    schemaVersion: 1 as const,
    consultantName: input.consultantName ?? "",
    clientName: input.clientName ?? "",
    clientId: input.clientId ?? null,
    clientGroupId: input.clientGroupId ?? null,
    label: input.label ?? "",
    inputs: input.inputs ?? {},
    pdfUrl: input.pdfUrl ?? null,
    createdAt: typeof input.createdAt === "number" ? input.createdAt : Date.now(),
    source: "web" as const,
  };

  try {
    const docRef = await addDoc(collection(db, "piaReports"), doc);
    return docRef.id;
  } catch {
    return null;
  }
}

export async function loadPIAReportsByConsultant(
  consultantName: string
): Promise<(PIAReport & { id: string })[]> {
  try {
    const q = query(
      collection(db, "piaReports"),
      where("consultantName", "==", consultantName)
    );
    const snapshot = await getDocs(q);

    const reports = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          schemaVersion: typeof data.schemaVersion === "number" ? data.schemaVersion : 1,
          consultantName: typeof data.consultantName === "string" ? data.consultantName : "",
          clientName: typeof data.clientName === "string" ? data.clientName : "",
          clientId: data.clientId ?? null,
          clientGroupId: data.clientGroupId ?? null,
          label: typeof data.label === "string" ? data.label : "",
          inputs: typeof data.inputs === "object" && data.inputs !== null ? data.inputs : {},
          pdfUrl: data.pdfUrl ?? null,
          createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
          source: typeof data.source === "string" ? data.source : "",
          id: doc.id,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    return reports;
  } catch {
    return [];
  }
}

export async function loadPIAReportsByClient(
  clientId: string
): Promise<(PIAReport & { id: string })[]> {
  try {
    const q = query(
      collection(db, "piaReports"),
      where("clientId", "==", clientId)
    );
    const snapshot = await getDocs(q);

    const reports = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          schemaVersion: typeof data.schemaVersion === "number" ? data.schemaVersion : 1,
          consultantName: typeof data.consultantName === "string" ? data.consultantName : "",
          clientName: typeof data.clientName === "string" ? data.clientName : "",
          clientId: data.clientId ?? null,
          clientGroupId: data.clientGroupId ?? null,
          label: typeof data.label === "string" ? data.label : "",
          inputs: typeof data.inputs === "object" && data.inputs !== null ? data.inputs : {},
          pdfUrl: data.pdfUrl ?? null,
          createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
          source: typeof data.source === "string" ? data.source : "",
          id: doc.id,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    return reports;
  } catch {
    return [];
  }
}

export async function uploadPIAPdf(
  blob: Blob,
  consultantName: string
): Promise<string | null> {
  if (!blob) return null;

  try {
    const timestamp = Date.now();
    const storageRef = ref(storage, `piaReports/${consultantName}_${timestamp}.pdf`);
    const snapshot = await uploadBytes(storageRef, blob);
    return await getDownloadURL(snapshot.ref);
  } catch {
    return null;
  }
}
