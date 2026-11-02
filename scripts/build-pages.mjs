// Builds the public GitHub Pages demo: a static single-page app that always runs in demo
// mode (in-browser mock data, no n8n calls), then checks the output before it can be deployed.
//
//   npm run build:pages                         # served from /supportflow-ai/
//   PAGES_BASE=/other-repo/ npm run build:pages # a different repository name
//
// Output: dist/client (index.html + 404.html for client-side routing, .nojekyll, assets).
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const base = process.env.PAGES_BASE || "/supportflow-ai/";
if (!/^\/([\w.-]+\/)*$/.test(base)) {
  console.error(`PAGES_BASE must look like /repo-name/ (got "${base}")`);
  process.exit(1);
}

const out = join("dist", "client");
rmSync("dist", { recursive: true, force: true });

// Force demo mode and blank the server-side settings, whatever .env contains.
const env = {
  ...process.env,
  PAGES_BASE: base,
  VITE_USE_MOCK_API: "true",
  VITE_PUBLIC_DEMO: "",
  VITE_TURNSTILE_SITE_KEY: "",
  TURNSTILE_SECRET_KEY: "",
  N8N_WEBHOOK_URL: "",
  N8N_RESERVATIONS_URL: "",
  N8N_WEBHOOK_SECRET: "",
};
const build = spawnSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], { env, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

// GitHub Pages serves 404.html for unknown paths, which lets deep links like /book load the app.
const shell = join(out, "_shell.html");
if (!existsSync(shell)) {
  console.error("Expected the SPA shell at dist/client/_shell.html");
  process.exit(1);
}
copyFileSync(shell, join(out, "index.html"));
copyFileSync(shell, join(out, "404.html"));
writeFileSync(join(out, ".nojekyll"), ""); // keep files starting with "_" visible on Pages

// --- Safety checks: the public demo must never contain backend details --------------------
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(js|html|css|json|txt)$/.test(name)) files.push(path);
  }
};
walk(out);
const text = files.map((f) => readFileSync(f, "utf8")).join("\n");

const localSecret = existsSync(".env")
  ? readFileSync(".env", "utf8").match(/^N8N_WEBHOOK_SECRET=(.+)$/m)?.[1]?.trim()
  : undefined;
const problems = [];
if (!/VITE_USE_MOCK_API:\s*[`"']true[`"']/.test(text)) problems.push("bundle is not built in demo mode");
if (/N8N_[A-Z_]+|X-SupportFlow-Key|\/webhook(-test)?\/|app\.n8n\.cloud/.test(text)) problems.push("n8n details found in output");
if (localSecret && text.includes(localSecret)) problems.push("the API key from .env was found in output");
// dist/server only exists to render the SPA shell during the build; it is never deployed.
if (files.some((f) => /server\.(js|mjs)$/.test(f))) problems.push("server code found in the deployable folder");

if (problems.length) {
  console.error("\nPages build rejected:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log(`\nPages demo ready in ${out} (base ${base}, ${files.length} text files checked, demo mode on, no backend details).`);
