const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const diagnostics = read("src/lib/operationalDiagnostics.ts");
assert.match(diagnostics, /export function classifyOperationalError/);
assert.match(diagnostics, /export function getActionableErrorMessage/);
assert.match(diagnostics, /export function logCallableFailure/);
assert.match(diagnostics, /export function logListenerFailure/);
assert.match(diagnostics, /auth_denied/);
assert.match(diagnostics, /callable_unavailable/);
assert.match(diagnostics, /network_failure/);

const settingsService = read("src/lib/settingsService.ts");
assert.match(settingsService, /logCallableFailure/);
assert.match(settingsService, /getActionableErrorMessage/);

const systemSettings = read("src/components/SystemSettingsPanel.tsx");
assert.match(systemSettings, /getActionableErrorMessage/);

const historyPanel = read("src/components/SettingsHistoryPanel.tsx");
assert.match(historyPanel, /logListenerFailure/);
assert.match(historyPanel, /getActionableErrorMessage/);

const functionsAudit = read("functions/src/audit.ts");
assert.match(functionsAudit, /buildAuditEvent/);

const functionsSettings = read("functions/src/settingsAdmin.ts");
assert.match(functionsSettings, /buildSettingsAuditEntry/);

const offlineQueue = read("src/hooks/useOfflineQueue.ts");
assert.match(offlineQueue, /const isOnlineRef = useRef<boolean>\(isOnline\)/);
assert.match(offlineQueue, /isOnlineRef\.current = true/);
assert.match(offlineQueue, /const latestQueue = loadQueue\(\)/);
assert.match(offlineQueue, /processedItems\.get\(item\.id\) \?\? item/);
