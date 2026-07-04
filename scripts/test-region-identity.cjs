const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "asg-region-identity-"));

execFileSync(
  process.platform === "win32" ? process.env.ComSpec : "npx",
  [
    ...(process.platform === "win32" ? ["/c", "npx"] : []),
    "tsc",
    "--module",
    "commonjs",
    "--target",
    "es2020",
    "--skipLibCheck",
    "--outDir",
    outDir,
    path.join(repoRoot, "src/lib/regionIdentity.ts"),
  ],
  { cwd: repoRoot, stdio: "pipe" },
);

const { getRegionIdentity, REGION_IDENTITIES } = require(path.join(outDir, "lib/regionIdentity.js"));
const appShell = fs.readFileSync(path.join(repoRoot, "src/App.tsx"), "utf8");
const appSidebar = fs.readFileSync(path.join(repoRoot, "src/components/navigation/AppSidebar.tsx"), "utf8");
const appStore = fs.readFileSync(path.join(repoRoot, "src/stores/appStore.ts"), "utf8");

assert.equal(getRegionIdentity("brisbane").label, "Brisbane");
assert.equal(getRegionIdentity("perth").label, "Perth");
assert.notEqual(getRegionIdentity("brisbane").accent, getRegionIdentity("perth").accent);
assert.match(getRegionIdentity("brisbane").tone, /warm/i);
assert.match(getRegionIdentity("perth").tone, /cool/i);
assert.deepEqual(Object.keys(REGION_IDENTITIES).sort(), ["brisbane", "perth"]);

assert.match(appShell, /onRegionChange=\{handleRegionChange\}/, "App shell should pass region switching into the sidebar.");
assert.match(appSidebar, /WorkspaceSwitcher/, "sidebar brand should render the shared workspace switcher.");
assert.match(appSidebar, /workspaceLabel\} workspace/, "workspace label should remain visible in the sidebar brand.");
assert.doesNotMatch(appShell, /const sidebarUserCard = \([\s\S]*Workspace[\s\S]*handleRegionChange/, "workspace selector should not remain buried in the footer/user card.");
assert.match(appShell, /Switching to \$\{nextIdentity\.label\} workspace/, "region switching should provide operator feedback.");
assert.match(appStore, /ACTIVE_REGION: "asg-crm:active-region"/, "active region should use a namespaced persistence key.");
assert.match(appStore, /localStorage\.setItem\(STORAGE_KEYS\.ACTIVE_REGION, activeRegion\)/, "region switching should persist the active workspace.");

console.log("Region identity checks passed");
