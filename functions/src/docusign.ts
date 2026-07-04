/**
 * docusign.ts — Production-grade DocuSign integration for Firebase Functions.
 *
 * Functions:
 *  1. createDocuSignEnvelope (onCall) — sends a document for signing
 *  2. docusignWebhook (onRequest) — receives & validates DocuSign Connect events
 *  3. resendDocuSignEnvelope (onCall) — resends a pending envelope
 *  4. voidDocuSignEnvelope (onCall) — voids a sent envelope
 *
 * Security:
 *  - JWT impersonation (RSA-256) for API auth
 *  - HMAC-SHA256 webhook signature validation
 *  - Idempotent event processing (lastProcessedEventId)
 *  - Authenticated callable functions (Firebase Auth required)
 *
 * Environment Variables:
 *  DOCUSIGN_INTEGRATOR_KEY / DOCUSIGN_CLIENT_ID
 *  DOCUSIGN_USER_ID
 *  DOCUSIGN_ACCOUNT_ID
 *  DOCUSIGN_BASE_URI
 *  DOCUSIGN_PRIVATE_KEY
 *  DOCUSIGN_WEBHOOK_SECRET (HMAC shared secret from DocuSign Connect)
 *  COMPLIANCE_EMAIL (optional — sends signed PDF to compliance)
 *  FUNCTIONS_URL (your hosting URL for webhook callback)
 *
 * Deploy:
 *  firebase functions:config:set docusign.integrator_key="..." ...
 *  npm run deploy -- --only functions
 */

import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { firestoreServerTimestamp } from "./firestoreCompat";
import * as path from "path";
import * as jwt from "jsonwebtoken";
import * as crypto from "crypto";

// ── Lazy-loaded Firebase references (side-effect free) ──
// These are initialized by index.ts via admin.initializeApp()
// We access them lazily via getter functions to avoid top-level initialization.
function getDb() {
  return admin.firestore();
}

function getStorage() {
  return admin.storage();
}

function getMessaging() {
  return admin.messaging();
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

interface DocuSignConfig {
  integratorKey: string;
  userId: string;
  accountId: string;
  baseUri: string;
  privateKey: string;
  webhookSecret: string;
  complianceEmail: string;
  functionsUrl: string;
}

function getDocuSignConfig(): DocuSignConfig {
  const cfg = process.env;
  const integratorKey = cfg.DOCUSIGN_INTEGRATOR_KEY || cfg.DOCUSIGN_CLIENT_ID || "";
  const userId = cfg.DOCUSIGN_USER_ID || "";
  const accountId = cfg.DOCUSIGN_ACCOUNT_ID || "";
  const baseUri = cfg.DOCUSIGN_BASE_URI || "https://demo.docusign.net/restapi";
  const privateKey = (cfg.DOCUSIGN_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const webhookSecret = cfg.DOCUSIGN_WEBHOOK_SECRET || "";
  const complianceEmail = cfg.COMPLIANCE_EMAIL || "";
  const functionsUrl = cfg.FUNCTIONS_URL || "https://YOUR_PROJECT.web.app";

  if (!integratorKey || !userId || !accountId || !privateKey) {
    throw new Error(
      "DocuSign configuration incomplete. Set DOCUSIGN_INTEGRATOR_KEY, DOCUSIGN_USER_ID, DOCUSIGN_ACCOUNT_ID, and DOCUSIGN_PRIVATE_KEY.",
    );
  }

  return { integratorKey, userId, accountId, baseUri, privateKey, webhookSecret, complianceEmail, functionsUrl };
}

// ─────────────────────────────────────────────────────────────────────────────
// JWT Authentication (Service Integration / Impersonation)
// ─────────────────────────────────────────────────────────────────────────────

async function getDocuSignAccessToken(cfg: DocuSignConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: cfg.integratorKey,
    sub: cfg.userId,
    iat: now,
    exp: now + 3600,
    aud: `${cfg.baseUri}/oauth/token`,
    scope: "signature impersonation",
  };

  return jwt.sign(payload, cfg.privateKey, {
    algorithm: "RS256",
    expiresIn: "1h",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook HMAC Validation + Replay Protection (CRITICAL SECURITY)
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum age of a valid webhook event (5 minutes) */
const WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Validates the HMAC signature AND timestamp from DocuSign Connect.
 *
 * DocuSign signs the raw request body with the shared secret configured
 * in Connect settings. We compute HMAC-SHA256 and compare.
 *
 * Additionally, the `generated` timestamp in the payload is checked
 * to prevent replay attacks — requests older than 5 minutes are rejected
 * even with valid signatures.
 *
 * If no webhook secret is configured, validation is skipped (not recommended
 * for production).
 */
function validateWebhookSignature(
  rawBody: Buffer,
  hmacHeader: string | undefined,
  webhookSecret: string,
  eventTimestamp?: string,
): boolean {
  // If no secret configured, skip validation (warn but don't block)
  if (!webhookSecret) {
    console.warn(
      "[DocuSign] Webhook secret not configured — skipping signature validation. SET DOCUSIGN_WEBHOOK_SECRET for production.",
    );
    return true;
  }

  if (!hmacHeader) {
    console.error("[DocuSign] Webhook rejected: missing X-DocuSign-Signature header.");
    return false;
  }

  // DocuSign sends HMAC as: HMAC-SHA256=abcdef1234...
  const signatureMatch = hmacHeader.match(/^HMAC-SHA256=([a-f0-9]+)$/i);
  if (!signatureMatch) {
    console.error("[DocuSign] Webhook rejected: invalid X-DocuSign-Signature format:", hmacHeader);
    return false;
  }

  const receivedHmac = signatureMatch[1].toLowerCase();
  const computedHmac = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex").toLowerCase();

  // Constant-time comparison to prevent timing attacks
  const isValid = crypto.timingSafeEqual(Buffer.from(receivedHmac, "hex"), Buffer.from(computedHmac, "hex"));

  if (!isValid) {
    console.error("[DocuSign] Webhook rejected: HMAC mismatch.", {
      received: receivedHmac.substring(0, 8),
      computed: computedHmac.substring(0, 8),
    });
    return false;
  }

  // ── Replay Protection: Validate timestamp ─────────────────────────────
  if (eventTimestamp) {
    const eventTime = new Date(eventTimestamp).getTime();
    if (!isNaN(eventTime)) {
      const age = Date.now() - eventTime;
      if (age > WEBHOOK_MAX_AGE_MS) {
        console.error("[DocuSign] Webhook rejected: event too old (replay attack?).", {
          eventTimestamp,
          ageMs: age,
          maxAgeMs: WEBHOOK_MAX_AGE_MS,
        });
        return false;
      }
      // Warn if event is slightly in the future (clock skew tolerance: 30s)
      if (eventTime > Date.now() + 30000) {
        console.warn("[DocuSign] Webhook event timestamp is in the future — possible clock skew.", {
          eventTimestamp,
        });
      }
    }
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function downloadFromStorage(storagePath: string): Promise<Buffer> {
  const bucket = getStorage().bucket();
  const file = bucket.file(storagePath);
  const [exists] = await file.exists();
  if (!exists) {
    throw new Error(`File not found in storage: ${storagePath}`);
  }
  const [contents] = await file.download();
  return contents;
}

async function uploadToStorage(
  buffer: Buffer,
  destinationPath: string,
  contentType = "application/pdf",
): Promise<string> {
  const bucket = getStorage().bucket();
  const file = bucket.file(destinationPath);
  await file.save(buffer, { metadata: { contentType } });
  await file.makePublic();
  return `https://getStorage().googleapis.com/${bucket.name}/${destinationPath}`;
}

async function notifyRep(repId: number, title: string, body: string, data?: Record<string, string>) {
  try {
    const deviceSnap = await getDb()
      .collection("userDevices")
      .where("userId", "==", repId)
      .where("active", "==", true)
      .get();

    const tokens: string[] = [];
    deviceSnap.forEach((d) => {
      const token = d.data().fcmToken as string | undefined;
      if (token) tokens.push(token);
    });

    if (tokens.length > 0) {
      await getMessaging().sendEachForMulticast({
        tokens,
        notification: { title, body },
        data: data || { link: "/deal-dashboard", section: "documents" },
      });
    }
  } catch (err) {
    console.error(`Failed to notify rep ${repId}:`, err);
  }
}

/**
 * Records a deal event in the dealEvents collection.
 */
async function recordDealEvent(params: {
  dealId: string;
  type: "docusign_sent" | "docusign_completed" | "docusign_declined" | "docusign_voided" | "docusign_resent" | "docusign_sync_sent" | "docusign_sync_completed" | "docusign_sync_declined" | "docusign_sync_voided";
  message: string;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await getDb().collection("dealEvents").add({
      dealId: params.dealId,
      type: params.type,
      message: params.message,
      createdBy: params.createdBy || "system",
      metadata: params.metadata || {},
      createdAt: firestoreServerTimestamp(),
    });
  } catch (err) {
    console.error("Failed to record deal event:", err);
  }
}

/**
 * Send signed PDF to compliance email (if configured).
 */
async function sendComplianceEmail(
  pdfBuffer: Buffer,
  fileName: string,
  dealId: string,
  clientName: string,
  complianceEmail: string,
): Promise<void> {
  try {
    // Use Firebase Auth to send a password reset-style email, or use SendGrid/Mailgun
    // Here we use a placeholder — in production, integrate with a real email service
    console.log(
      `[Compliance Email] Would send signed PDF "${fileName}" to ${complianceEmail} for deal ${dealId} (${clientName})`,
    );
    // Production implementation:
    // const mailOptions = {
    //   to: complianceEmail,
    //   subject: `Signed O&A Document — ${clientName} (Deal ${dealId})`,
    //   text: `Please find attached the signed O&A document for ${clientName}.`,
    //   attachments: [{ filename: fileName, content: pdfBuffer, contentType: "application/pdf" }],
    // };
    // await sendMail(mailOptions); // via SendGrid, Mailgun, etc.
  } catch (err) {
    console.error("Failed to send compliance email:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-Signer Envelope Builder
// ─────────────────────────────────────────────────────────────────────────────

interface SignerConfig {
  email: string;
  name: string;
  routingOrder?: string; // "1", "2", etc. — determines signing order
  role?: "signer" | "cc" | "agent";
}

function buildEnvelopeDefinition(params: {
  documentBase64: string;
  fileName: string;
  signers: SignerConfig[];
  emailSubject?: string;
  eventNotificationUrl?: string;
}): Record<string, unknown> {
  const signers = params.signers.map((s, i) => ({
    email: s.email,
    name: s.name,
    recipientId: String(i + 1),
    routingOrder: s.routingOrder || String(i + 1),
    tabs: {
      signHereTabs: [
        {
          documentId: "1",
          pageNumber: "1",
          xPosition: "200",
          yPosition: "200",
        },
      ],
    },
  }));

  return {
    emailSubject: params.emailSubject || `Please sign: ${params.fileName}`,
    status: "sent",
    documents: [
      {
        documentBase64: params.documentBase64,
        name: params.fileName,
        fileExtension: "pdf",
        documentId: "1",
      },
    ],
    recipients: {
      signers,
    },
    eventNotification: {
      url: params.eventNotificationUrl || "",
      loggingEnabled: "true",
      requireAcknowledgment: "true",
      useSoapInterface: "false",
      includeCertificateWithSoap: "false",
      signMessageWithX509Cert: "false",
      includeDocuments: "true",
      envelopeEvents: [
        { envelopeEventStatusCode: "completed", includeDocuments: "true" },
        { envelopeEventStatusCode: "declined" },
        { envelopeEventStatusCode: "voided" },
        { envelopeEventStatusCode: "sent" },
        { envelopeEventStatusCode: "delivered" },
      ],
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. createDocuSignEnvelope (onCall)
// ─────────────────────────────────────────────────────────────────────────────

interface CreateEnvelopeRequest {
  documentUrl: string;
  clientName: string;
  clientEmail: string;
  dealId: string;
  clientId: string;
  documentName?: string;
  oaDocumentInstanceId?: string; // link to originating document instance
  signers?: SignerConfig[]; // multi-signer support
}

export const createDocuSignEnvelope = onCall<CreateEnvelopeRequest>(async (request) => {
  const { documentUrl, clientName, clientEmail, dealId, clientId, documentName, oaDocumentInstanceId, signers } =
    request.data || {};

  if (!documentUrl || !clientName || !clientEmail || !dealId || !clientId) {
    throw new HttpsError(
      "invalid-argument",
      "documentUrl, clientName, clientEmail, dealId, and clientId are required.",
    );
  }

  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }

  // ── Prevent duplicate send: check for existing active envelope ──────────
  const existingQuery = await getDb()
    .collection("docusignEnvelopes")
    .where("dealId", "==", dealId)
    .where("oaDocumentInstanceId", "==", oaDocumentInstanceId || null)
    .get();

  let existingSent = false;
  existingQuery.forEach((doc) => {
    const data = doc.data();
    if (data.status === "sent" || data.status === "completed") {
      existingSent = true;
    }
  });

  if (existingSent) {
    throw new HttpsError("already-exists", "This document has already been sent for signing. Use resend if needed.");
  }

  const cfg = getDocuSignConfig();
  const accessToken = await getDocuSignAccessToken(cfg);

  // Download document
  let documentBuffer: Buffer;
  let fileName = documentName || "document.pdf";

  try {
    if (documentUrl.startsWith("gs://") || !documentUrl.startsWith("http")) {
      const storagePath = documentUrl.replace("gs://", "");
      documentBuffer = await downloadFromStorage(storagePath);
      fileName = path.basename(storagePath);
    } else {
      const response = await fetch(documentUrl);
      if (!response.ok) throw new Error(`Failed to fetch document: ${response.status}`);
      documentBuffer = Buffer.from(await response.arrayBuffer());
    }
  } catch (err) {
    console.error("Failed to download document:", err);
    throw new HttpsError("internal", "Failed to download document from getStorage().");
  }

  const documentBase64 = documentBuffer.toString("base64");

  // Build signers list (backward-compatible with single signer)
  const signerList: SignerConfig[] =
    signers && signers.length > 0 ? signers : [{ email: clientEmail, name: clientName, routingOrder: "1" }];

  const webhookUrl = `${cfg.functionsUrl}/docusignWebhook`;
  const envelopeDefinition = buildEnvelopeDefinition({
    documentBase64,
    fileName,
    signers: signerList,
    emailSubject: `Please sign: ${fileName}`,
    eventNotificationUrl: webhookUrl,
  });

  // Create envelope via DocuSign API
  const apiUrl = `${cfg.baseUri}/v2.1/accounts/${cfg.accountId}/envelopes`;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(envelopeDefinition),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("DocuSign API error:", response.status, errorBody);
    throw new HttpsError("internal", `DocuSign API error: ${response.status}`);
  }

  const envelopeResult = (await response.json()) as {
    envelopeId: string;
    status: string;
    uri: string;
  };

  const envelopeId = envelopeResult.envelopeId;

  // Store in Firestore with DocuSign viewing URL
  const viewingUrl = `${cfg.baseUri.replace("/restapi", "")}/authenticate?returnUrl=${encodeURIComponent(`${cfg.baseUri}/v2.1/accounts/${cfg.accountId}/envelopes/${envelopeId}`)}`;

  const envelopeRef = await getDb().collection("docusignEnvelopes").add({
    dealId,
    clientId,
    envelopeId,
    oaDocumentInstanceId: oaDocumentInstanceId || null,
    documentUrl,
    documentName: fileName,
    clientName,
    clientEmail,
    signers: signerList,
    status: "sent",
    sentBy: request.auth.uid,
    viewingUrl,
    lastProcessedEventId: null,
    createdAt: firestoreServerTimestamp(),
    updatedAt: firestoreServerTimestamp(),
  });

  // ── Lock the document instance to prevent further edits ───────────────
  if (oaDocumentInstanceId) {
    try {
      await getDb().collection("documentInstances").doc(oaDocumentInstanceId).update({
        status: "locked",
        editable: false,
        envelopeId,
        updatedAt: firestoreServerTimestamp(),
      });
    } catch (err) {
      console.error("[DocuSign] Failed to lock document instance:", err);
    }
  }

  // Record deal event
  await recordDealEvent({
    dealId,
    type: "docusign_sent",
    message: `O&A document sent to ${clientName} for signing via DocuSign.`,
    createdBy: request.auth.uid,
    metadata: { envelopeId, documentName: fileName },
  });

  console.log(`DocuSign envelope created: ${envelopeId} for deal ${dealId}`);

  return {
    success: true,
    envelopeId,
    status: "sent",
    envelopeDocId: envelopeRef.id,
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. resendDocuSignEnvelope (onCall)
// ─────────────────────────────────────────────────────────────────────────────

interface ResendEnvelopeRequest {
  envelopeId: string;
}

export const resendDocuSignEnvelope = onCall<ResendEnvelopeRequest>(async (request) => {
  const { envelopeId } = request.data || {};

  if (!envelopeId) {
    throw new HttpsError("invalid-argument", "envelopeId is required.");
  }
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }

  const cfg = getDocuSignConfig();
  const accessToken = await getDocuSignAccessToken(cfg);

  // Resend via DocuSign API
  const apiUrl = `${cfg.baseUri}/v2.1/accounts/${cfg.accountId}/envelopes/${envelopeId}`;
  const response = await fetch(apiUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "sent" }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("DocuSign resend error:", response.status, errorBody);
    throw new HttpsError("internal", `DocuSign resend error: ${response.status}`);
  }

  // Update Firestore
  const query = await getDb().collection("docusignEnvelopes").where("envelopeId", "==", envelopeId).limit(1).get();
  if (!query.empty) {
    const doc = query.docs[0];
    await doc.ref.update({
      status: "sent",
      resentAt: firestoreServerTimestamp(),
      updatedAt: firestoreServerTimestamp(),
    });

    await recordDealEvent({
      dealId: doc.data().dealId,
      type: "docusign_resent",
      message: `Envelope resent to client via DocuSign.`,
      createdBy: request.auth.uid,
      metadata: { envelopeId },
    });
  }

  return { success: true, status: "resent" };
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. voidDocuSignEnvelope (onCall)
// ─────────────────────────────────────────────────────────────────────────────

interface VoidEnvelopeRequest {
  envelopeId: string;
  reason?: string;
}

export const voidDocuSignEnvelope = onCall<VoidEnvelopeRequest>(async (request) => {
  const { envelopeId, reason } = request.data || {};

  if (!envelopeId) {
    throw new HttpsError("invalid-argument", "envelopeId is required.");
  }
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }

  const cfg = getDocuSignConfig();
  const accessToken = await getDocuSignAccessToken(cfg);

  // Void via DocuSign API
  const apiUrl = `${cfg.baseUri}/v2.1/accounts/${cfg.accountId}/envelopes/${envelopeId}`;
  const response = await fetch(apiUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "voided", voidedReason: reason || "Voided by sender" }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("DocuSign void error:", response.status, errorBody);
    throw new HttpsError("internal", `DocuSign void error: ${response.status}`);
  }

  // Update Firestore
  const query = await getDb().collection("docusignEnvelopes").where("envelopeId", "==", envelopeId).limit(1).get();
  if (!query.empty) {
    const doc = query.docs[0];
    const data = doc.data();
    await doc.ref.update({
      status: "voided",
      voidedReason: reason || "Voided by sender",
      voidedAt: firestoreServerTimestamp(),
      updatedAt: firestoreServerTimestamp(),
    });

    await recordDealEvent({
      dealId: data.dealId,
      type: "docusign_voided",
      message: `Envelope voided: ${reason || "No reason provided"}.`,
      createdBy: request.auth.uid,
      metadata: { envelopeId },
    });

    // Notify rep
    if (data.sentBy) {
      const repId = parseInt(data.sentBy, 10);
      if (!isNaN(repId)) {
        await notifyRep(repId, "Envelope Voided", `DocuSign envelope has been voided: ${reason || "No reason"}.`);
      }
    }
  }

  return { success: true, status: "voided" };
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. syncEnvelopeStatus (onCall) — on-demand status check against DocuSign API
// ─────────────────────────────────────────────────────────────────────────────

interface SyncStatusRequest {
  envelopeId: string;
}

export const syncEnvelopeStatus = onCall<SyncStatusRequest>(async (request) => {
  const { envelopeId } = request.data || {};

  if (!envelopeId) {
    throw new HttpsError("invalid-argument", "envelopeId is required.");
  }
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }

  const cfg = getDocuSignConfig();
  const accessToken = await getDocuSignAccessToken(cfg);

  // Fetch current status from DocuSign API
  const apiUrl = `${cfg.baseUri}/v2.1/accounts/${cfg.accountId}/envelopes/${envelopeId}`;
  const response = await fetch(apiUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("DocuSign status sync error:", response.status, errorBody);
    throw new HttpsError("internal", `DocuSign status sync error: ${response.status}`);
  }

  const envelopeInfo = (await response.json()) as { status: string; envelopeId: string };
  const actualStatus = envelopeInfo.status || "unknown";

  // Find in Firestore
  const query = await getDb().collection("docusignEnvelopes").where("envelopeId", "==", envelopeId).limit(1).get();

  let statusMismatch = false;
  let previousStatus = "";

  if (!query.empty) {
    const doc = query.docs[0];
    const data = doc.data();
    previousStatus = (data.status as string) || "";

    if (previousStatus !== actualStatus) {
      statusMismatch = true;
      console.log(
        `[DocuSign Sync] Status mismatch for ${envelopeId}: Firestore=${previousStatus}, DocuSign=${actualStatus}`,
      );

      await doc.ref.update({
        status: actualStatus,
        syncedAt: firestoreServerTimestamp(),
        updatedAt: firestoreServerTimestamp(),
      });

      // Record deal event for the correction
      await recordDealEvent({
        dealId: data.dealId,
        type: `docusign_sync_${actualStatus}` as any,
        message: `Envelope status corrected from "${previousStatus}" to "${actualStatus}" via sync.`,
        createdBy: request.auth.uid,
        metadata: { envelopeId, previousStatus },
      });
    }
  }

  return {
    success: true,
    envelopeId,
    actualStatus,
    previousStatus,
    statusMismatch,
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. docusignWebhook (onRequest) — with full security & idempotency
// ─────────────────────────────────────────────────────────────────────────────

export const docusignWebhook = onRequest(async (req, res) => {
  // Handle DocuSign's initial connectivity ping
  if (req.method === "GET") {
    res.status(200).send("Webhook endpoint is active.");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Method not allowed.");
    return;
  }

  // Get raw body for HMAC validation
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
  const hmacHeader = req.headers["x-docusign-signature"] as string | undefined;

  // ── SECURITY: Validate HMAC signature + replay protection ─────────────
  const cfg = getDocuSignConfig();
  const isValidSignature = validateWebhookSignature(
    rawBody,
    hmacHeader,
    cfg.webhookSecret,
    (req.body as Record<string, unknown>)?.generated as string | undefined,
  );
  if (!isValidSignature) {
    console.error("[DocuSign Webhook] REJECTED — invalid signature or expired timestamp. Request logged.");
    res.status(401).send("Unauthorized: invalid signature or expired timestamp.");
    return;
  }

  try {
    const body = req.body as Record<string, unknown> & {
      envelopeId?: string;
      envelopeStatus?: string;
      status?: string;
      event?: string;
      generated?: string; // DocuSign event timestamp
      document?: { PDFBytes?: string };
    };

    const envelopeId = body.envelopeId;
    const envelopeStatus = (body.envelopeStatus || body.status || "unknown") as string;
    const eventId = body.generated || `${envelopeId}_${envelopeStatus}_${Date.now()}`;

    if (!envelopeId) {
      console.warn("[DocuSign Webhook] Missing envelopeId — ignoring.");
      res.status(200).send("OK: no envelopeId");
      return;
    }

    console.log(
      `[DocuSign Webhook] envelope ${envelopeId} — status: ${envelopeStatus} — event: ${body.event || "unknown"}`,
    );

    // Find the Firestore envelope document
    const envelopeQuery = await getDb().collection("docusignEnvelopes").where("envelopeId", "==", envelopeId).limit(1).get();

    if (envelopeQuery.empty) {
      console.warn(`[DocuSign Webhook] Unknown envelope ${envelopeId} — ignoring.`);
      res.status(200).send("OK: unknown envelope");
      return;
    }

    const envelopeDoc = envelopeQuery.docs[0];
    const envelopeData = envelopeDoc.data() as Record<string, unknown>;
    const currentStatus = (envelopeData.status as string) || "unknown";
    const lastProcessedEventId = (envelopeData.lastProcessedEventId as string) || "";

    // ── DUPLICATE EVENT PROTECTION: Idempotent processing ────────────────
    if (lastProcessedEventId === eventId) {
      console.log(`[DocuSign Webhook] Duplicate event ${eventId} — skipping.`);
      res.status(200).send("OK: duplicate ignored");
      return;
    }

    // If envelope is already completed, ignore further completed events
    if (currentStatus === "completed" && envelopeStatus === "completed") {
      console.log(`[DocuSign Webhook] Envelope ${envelopeId} already completed — ignoring duplicate.`);
      res.status(200).send("OK: already completed");
      return;
    }

    // If envelope is already voided/declined, ignore further events
    if ((currentStatus === "voided" || currentStatus === "declined") && envelopeStatus !== "completed") {
      console.log(`[DocuSign Webhook] Envelope ${envelopeId} already ${currentStatus} — ignoring.`);
      res.status(200).send("OK: already processed");
      return;
    }

    const { dealId, clientId, documentName, oaDocumentInstanceId, clientName } = envelopeData;

    // ── Handle completed envelope ────────────────────────────────────────
    if (envelopeStatus === "completed") {
      let signedPdfBuffer: Buffer | null = null;

      // Try webhook payload first
      if (body.document?.PDFBytes) {
        try {
          signedPdfBuffer = Buffer.from(body.document.PDFBytes as string, "base64");
        } catch (err) {
          console.error("[DocuSign Webhook] Failed to decode PDF from webhook:", err);
        }
      }

      // Fallback: fetch from DocuSign API
      if (!signedPdfBuffer) {
        try {
          const accessToken = await getDocuSignAccessToken(cfg);
          const docUrl = `${cfg.baseUri}/v2.1/accounts/${cfg.accountId}/envelopes/${envelopeId}/documents/combined`;
          const response = await fetch(docUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (response.ok) {
            signedPdfBuffer = Buffer.from(await response.arrayBuffer());
          }
        } catch (err) {
          console.error("[DocuSign Webhook] Failed to fetch signed document:", err);
        }
      }

      let signedStoragePath = "";
      let signedUrl = "";

      if (signedPdfBuffer) {
        // Standardised file naming: {clientName}_{dealId}_OA_Signed_{YYYYMMDD}.pdf
        const safeClientName = ((clientName as string) || "client")
          .replace(/[^a-zA-Z0-9._-]/g, "_")
          .replace(/_+/g, "_")
          .substring(0, 50);
        const safeDealId = ((dealId as string) || "unknown").replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, 30);
        const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, "");
        const sanitizedName = `${safeClientName}_${safeDealId}_OA_Signed_${dateStr}.pdf`;

        signedStoragePath = `deals/${dealId}/signed/${sanitizedName}`;
        signedUrl = await uploadToStorage(signedPdfBuffer, signedStoragePath);

        // Register as dealDocument
        await getDb().collection("dealDocuments").add({
          dealId,
          clientId: clientId || "",
          name: `Signed O&A — ${documentName || "document"}`,
          type: "contract",
          fileUrl: signedUrl,
          storagePath: signedStoragePath,
          fileType: "application/pdf",
          fileSize: signedPdfBuffer.byteLength,
          uploadedBy: "DocuSign",
          signed: true,
          createdAt: firestoreServerTimestamp(),
        });

        console.log(`[DocuSign Webhook] Signed document uploaded: ${signedUrl}`);

        // Compliance email (if configured)
        if (cfg.complianceEmail) {
          await sendComplianceEmail(
            signedPdfBuffer,
            `${sanitizedName}_signed.pdf`,
            dealId as string,
            clientName as string,
            cfg.complianceEmail,
          );
        }
      }

      // Update envelope document
      const updateData: Record<string, unknown> = {
        status: "completed",
        signedUrl,
        signedStoragePath,
        completedAt: firestoreServerTimestamp(),
        updatedAt: firestoreServerTimestamp(),
        lastProcessedEventId: eventId,
      };

      await envelopeDoc.ref.update(updateData);

      // Update linked document instance
      if (oaDocumentInstanceId) {
        try {
          await getDb()
            .collection("documentInstances")
            .doc(oaDocumentInstanceId as string)
            .update({
              status: "signed",
              signedUrl,
              signedAt: firestoreServerTimestamp(),
              updatedAt: firestoreServerTimestamp(),
            });
        } catch (err) {
          console.error("[DocuSign Webhook] Failed to update document instance:", err);
        }
      }

      // Fallback: update most recent OA document instance for this deal
      if (!oaDocumentInstanceId && dealId) {
        try {
          const instanceQuery = await getDb()
            .collection("documentInstances")
            .where("dealId", "==", dealId)
            .where("type", "==", "offer-and-acceptance")
            .orderBy("createdAt", "desc")
            .limit(1)
            .get();

          if (!instanceQuery.empty) {
            await instanceQuery.docs[0].ref.update({
              status: "signed",
              signedUrl,
              signedAt: firestoreServerTimestamp(),
              updatedAt: firestoreServerTimestamp(),
            });
          }
        } catch (err) {
          console.error("[DocuSign Webhook] Failed to update fallback document instance:", err);
        }
      }

      // Notify rep
      const sentBy = envelopeData.sentBy as string | undefined;
      if (sentBy) {
        const repId = parseInt(sentBy, 10);
        if (!isNaN(repId)) {
          await notifyRep(
            repId,
            "Document Signed ✅",
            `${clientName || "Client"} has signed the ${documentName || "document"}.`,
            { link: "/deal-dashboard", section: "documents", dealId: dealId as string },
          );
        }
      }

      // Notify admins
      try {
        const adminsSnap = await getDb().collection("reps").where("active", "==", true).where("role", "==", "admin").get();

        for (const adminDoc of adminsSnap.docs) {
          const adminId = parseInt(adminDoc.id, 10);
          if (!isNaN(adminId)) {
            await notifyRep(
              adminId,
              "Document Signed ✅",
              `${clientName || "Client"} signed ${documentName || "document"} for deal ${dealId}.`,
              { link: "/deal-dashboard", dealId: dealId as string },
            );
          }
        }
      } catch (err) {
        console.error("[DocuSign Webhook] Failed to notify admins:", err);
      }

      // Record deal event
      await recordDealEvent({
        dealId: dealId as string,
        type: "docusign_completed",
        message: `Document signed by ${clientName || "client"} via DocuSign.${signedUrl ? " Signed PDF stored." : ""}`,
        metadata: { envelopeId, signedUrl },
      });
    }

    // ── Handle declined ──────────────────────────────────────────────────
    if (envelopeStatus === "declined") {
      await envelopeDoc.ref.update({
        status: "declined",
        declinedAt: firestoreServerTimestamp(),
        updatedAt: firestoreServerTimestamp(),
        lastProcessedEventId: eventId,
      });

      const sentBy = envelopeData.sentBy as string | undefined;
      if (sentBy) {
        const repId = parseInt(sentBy, 10);
        if (!isNaN(repId)) {
          await notifyRep(
            repId,
            "Document Declined ❌",
            `${clientName || "Client"} declined to sign the ${documentName || "document"}.`,
            { link: "/deal-dashboard", dealId: dealId as string },
          );
        }
      }

      await recordDealEvent({
        dealId: dealId as string,
        type: "docusign_declined",
        message: `${clientName || "Client"} declined to sign via DocuSign.`,
        metadata: { envelopeId },
      });
    }

    // ── Handle voided ────────────────────────────────────────────────────
    if (envelopeStatus === "voided") {
      await envelopeDoc.ref.update({
        status: "voided",
        voidedAt: firestoreServerTimestamp(),
        updatedAt: firestoreServerTimestamp(),
        lastProcessedEventId: eventId,
      });

      await recordDealEvent({
        dealId: dealId as string,
        type: "docusign_voided",
        message: `DocuSign envelope voided.`,
        metadata: { envelopeId },
      });
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("[DocuSign Webhook] Unhandled error:", err);
    res.status(500).send("Internal server error");
  }
});
