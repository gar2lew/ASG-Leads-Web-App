"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSmsfFinancials = exports.saveSmsfFinancials = void 0;
const admin = require("firebase-admin");
const crypto = require("crypto");
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
admin.initializeApp();
const smsfSecret = (0, params_1.defineSecret)("SMSF_SECRET");
function encrypt(text, secret) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(secret.padEnd(32)), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString("hex") + ":" + encrypted.toString("hex");
}
exports.saveSmsfFinancials = (0, https_1.onCall)({ secrets: [smsfSecret] }, async (request) => {
    const SECRET = smsfSecret.value();
    const data = request.data;
    const context = request.auth;
    if (!context) {
        throw new https_1.HttpsError("unauthenticated", "Not authorised");
    }
    const { clientId, accountName, bsb, accountNumber } = data;
    if (!clientId) {
        throw new https_1.HttpsError("invalid-argument", "Missing clientId");
    }
    const db = admin.firestore();
    await db.collection("smsfFinancials").doc(String(clientId)).set({
        accountName: encrypt(accountName, SECRET),
        bsb: encrypt(bsb, SECRET),
        accountNumber: encrypt(accountNumber, SECRET),
        createdAt: Date.now(),
    });
    await db.collection("auditLogs").add({
        type: "smsf_write",
        clientId: String(clientId),
        userId: context.uid,
        timestamp: Date.now(),
    });
    return { success: true };
});
function decrypt(data, secret) {
    const [ivHex, encryptedHex] = data.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const encryptedText = Buffer.from(encryptedHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(secret.padEnd(32)), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}
exports.getSmsfFinancials = (0, https_1.onCall)({ secrets: [smsfSecret] }, async (request) => {
    const SECRET = smsfSecret.value();
    const data = request.data;
    const context = request.auth;
    if (!context) {
        throw new https_1.HttpsError("unauthenticated", "Not authorised");
    }
    const { clientId } = data;
    const db = admin.firestore();
    const doc = await db.collection("smsfFinancials").doc(String(clientId)).get();
    if (!doc.exists)
        return null;
    const d = doc.data();
    await db.collection("auditLogs").add({
        type: "smsf_read",
        clientId: String(clientId),
        userId: context.uid,
        timestamp: Date.now(),
    });
    return {
        accountName: decrypt(d.accountName, SECRET),
        bsb: decrypt(d.bsb, SECRET),
        accountNumber: decrypt(d.accountNumber, SECRET),
    };
});
//# sourceMappingURL=smsfFinancials.js.map