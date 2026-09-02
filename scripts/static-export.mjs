import {access, rename, rm} from "node:fs/promises";
import {spawn} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const repositoryRoot = path.dirname(
    path.dirname(fileURLToPath(import.meta.url)),
);

const apiDir = path.join(repositoryRoot, "apps", "web", "src", "app", "api", "app-update");
// IMPORTANT: // The backup must be outside Next.js's `app` directory. // Renaming it to `app-update.disabled` inside `app/api` does NOT work, // because Next.js still treats that directory as an App Router route.
const disabledApiDir = path.join(repositoryRoot, ".static-export-app-update-backup");

const devBuildDir = path.join(
    repositoryRoot,
    "apps",
    "web",
    ".next-dev",
);

function run(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: repositoryRoot,
            stdio: "inherit",
            shell: false,
            ...options,
        });

        child.on("error", reject);

        child.on("close", (code, signal) => {
            if (signal) {
                reject(new Error(`${command} terminated by signal ${signal}`));
                return;
            }

            if (code !== 0) {
                reject(new Error(`${command} exited with code ${code}`));
                return;
            }

            resolve();
        });
    });
}

async function exists(filePath) {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function main() {
    const hasApiRoute = await exists(apiDir);

    if (!hasApiRoute) {
        throw new Error(`Could not find app-update API route: ${apiDir}`);
    }

    if (await exists(disabledApiDir)) {
        throw new Error(
            `Temporary directory already exists: ${disabledApiDir}. ` +
            "Remove it before running the static export.",
        );
    }

    let apiDisabled = false;

    try {
        console.log("Preparing static export...");

        // .next-dev contains generated route type files from next dev.
        // Those files can still be picked up by TypeScript after the source
        // route is temporarily removed for static export.
        if (await exists(devBuildDir)) {
            console.log("Removing stale .next-dev build artifacts...");
            await rm(devBuildDir, {recursive: true, force: true});
        }

        console.log(
            `Temporarily disabling: ${path.relative(repositoryRoot, apiDir)}`,
        );

        await rename(apiDir, disabledApiDir);
        apiDisabled = true;

        console.log("Building static Next.js application...");

        const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

        await run(
            npmCommand,
            ["exec", "next", "--", "build", "apps/web"],
            {
                env: {
                    ...process.env,
                    STATIC_EXPORT: "true",
                },
            },
        );

        console.log("Verifying static worker assets...");

        await run(
            npmCommand,
            ["run", "verify:static-worker-assets"],
            {
                env: {
                    ...process.env,
                    STATIC_EXPORT: "true",
                },
            },
        );

        console.log("Static export completed successfully.");
    } finally {
        if (apiDisabled) {
            console.log("Restoring app-update API route...");
            await rename(disabledApiDir, apiDir);
        }
    }
}

main().catch((error) => {
    console.error("\nStatic export failed:");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});