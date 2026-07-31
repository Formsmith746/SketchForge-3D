import { spawnSync } from "node:child_process";

const REQUIRED_CONFIRMATION = "DEPLOY_SKETCHFORGE3D_PRODUCTION";

if (process.env.SKETCHFORGE_PRODUCTION_DEPLOY !== REQUIRED_CONFIRMATION) {
  console.error("Production deployment is locked.");
  console.error(`Set SKETCHFORGE_PRODUCTION_DEPLOY=${REQUIRED_CONFIRMATION} only after explicit staging approval.`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("npm", ["run", "export"]);
run("npx", ["wrangler", "deploy", "-c", "wrangler.jsonc"]);
