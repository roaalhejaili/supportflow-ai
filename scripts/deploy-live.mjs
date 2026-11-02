// Builds and deploys the public live demo to Cloudflare Workers (free plan).
//
//   npm run deploy:live -- --mock   # safe first deploy: demo mode, no backend calls
//   npm run deploy:live             # live demo: real n8n backend behind the Turnstile check
//   add --dry-run to build and run the checks without uploading
//
// Server-side settings are Cloudflare secrets (never in the browser, Git or this script):
//   N8N_WEBHOOK_URL, N8N_RESERVATIONS_URL  -> the *public demo* n8n webhooks
//   N8N_WEBHOOK_SECRET                     -> the public demo key (not your private key)
//   TURNSTILE_SECRET_KEY                   -> enables the bot check and rate limit
// The live build reads VITE_TURNSTILE_SITE_KEY (public by design) from the environment or .env.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const WORKER = "supportflow-ai";
const mock = process.argv.includes("--mock");

const dotenv = existsSync(".env") ? readFileSync(".env", "utf8") : "";
const fromDotenv = (name) => dotenv.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim() ?? "";
const siteKey = process.env.VITE_TURNSTILE_SITE_KEY || fromDotenv("VITE_TURNSTILE_SITE_KEY");
if (!mock && !siteKey) {
  console.error("Set VITE_TURNSTILE_SITE_KEY (Cloudflare Turnstile site key) before a live deploy.");
  process.exit(1);
}

// Browser settings are baked in at build time; server settings are blanked so nothing secret
// can be bundled (the Worker reads them from Cloudflare secrets at runtime).
const env = {
  ...process.env,
  VITE_USE_MOCK_API: mock ? "true" : "false",
  VITE_PUBLIC_DEMO: "true",
  VITE_TURNSTILE_SITE_KEY: mock ? "" : siteKey,
  N8N_WEBHOOK_URL: "",
  N8N_RESERVATIONS_URL: "",
  N8N_WEBHOOK_SECRET: "",
  TURNSTILE_SECRET_KEY: "",
};
rmSync(".output", { recursive: true, force: true });
const run = (args, opts = {}) => spawnSync(process.execPath, args, { env, stdio: "inherit", ...opts }).status;
if (run(["node_modules/vite/bin/vite.js", "build"]) !== 0) process.exit(1);

// --- Safety checks on what the browser will download ---------------------------------------
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(js|html|css|json)$/.test(name)) files.push(path);
  }
};
walk(join(".output", "public"));
const text = files.map((f) => readFileSync(f, "utf8")).join("\n");
const problems = [];
for (const name of ["N8N_WEBHOOK_SECRET", "N8N_PUBLIC_WEBHOOK_SECRET"]) {
  const value = fromDotenv(name);
  if (value && text.includes(value)) problems.push(`${name} value found in browser files`);
}
if (/TURNSTILE_SECRET_KEY|siteverify|X-SupportFlow-Key|app\.n8n\.cloud/.test(text)) problems.push("server-only details found in browser files");
if (!new RegExp(`VITE_USE_MOCK_API:\\s*[\`"']${mock ? "true" : "false"}`).test(text)) problems.push("unexpected demo/live mode in bundle");
if (problems.length) {
  console.error("\nDeploy blocked:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log(`\nChecks passed (${files.length} browser files, ${mock ? "demo mode" : "live mode"}). Deploying "${WORKER}"...`);

const wrangler = join("node_modules", "wrangler", "bin", "wrangler.js");
const dryRun = process.argv.includes("--dry-run") ? ["--dry-run"] : []; // build and check only
process.exit(run([wrangler, "deploy", "--config", join(".output", "server", "wrangler.json"), "--name", WORKER, ...dryRun]) ?? 1);
