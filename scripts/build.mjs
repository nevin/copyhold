import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = join(root, "dist");
const browsers = ["chromium", "firefox"];
const assets = [
  "clipboard.js",
  "entries.js",
  "expiry.js",
  "manager.css",
  "manager.html",
  "manager.js",
  "store.js",
  "icons/48.png",
];

async function build() {
  const args = process.argv.slice(2);
  const zip = args.includes("--zip");
  const targets = args.filter((arg) => arg !== "--zip");
  if (targets.length > 1 || targets.some((target) => !browsers.includes(target))) {
    throw new Error("Usage: npm run <build|package> -- [chromium|firefox]");
  }

  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  if (typeof manifest.version !== "string" || !/^\d+(\.\d+){0,3}$/.test(manifest.version)) {
    throw new Error("manifest.json must have a numeric extension version.");
  }

  const files = [...new Set([
    ...assets,
    manifest.action.default_popup,
    ...Object.values(manifest.action.default_icon),
    ...Object.values(manifest.icons),
  ])].sort();

  await mkdir(dist, { recursive: true });
  const staging = await mkdtemp(join(dist, ".build-"));
  try {
    for (const browser of targets.length ? targets : browsers) {
      const output = join(staging, browser);
      const browserManifest = { ...manifest };
      if (browser === "chromium") delete browserManifest.browser_specific_settings;
      if (browser === "firefox") {
        browserManifest.background = { scripts: ["expiry.js"], type: "module" };
        delete browserManifest.minimum_chrome_version;
        browserManifest.permissions = manifest.permissions.filter(
          (permission) => permission !== "offscreen" && permission !== "storage",
        );
      }
      const browserFiles = browser === "chromium"
        ? [...files, manifest.background.service_worker, "offscreen.html", "offscreen.js"]
        : files;

      for (const file of browserFiles) {
        const destination = join(output, file);
        await mkdir(dirname(destination), { recursive: true });
        await copyFile(join(root, file), destination);
      }
      await writeFile(join(output, "manifest.json"), `${JSON.stringify(browserManifest, null, 2)}\n`);

      if (zip) {
        const archive = `clipfile-${manifest.version}-${browser}.zip`;
        execFileSync("zip", ["-q", "-X", join(staging, archive), "manifest.json", ...browserFiles], {
          cwd: output,
          stdio: "inherit",
        });
        await rename(join(staging, archive), join(dist, archive));
        console.log(`Packaged dist/${archive}`);
      }

      const destination = join(dist, browser);
      await rm(destination, { recursive: true, force: true });
      await rename(output, destination);
      console.log(`Built dist/${browser}`);
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

build().catch((error) => {
  console.error(error.code === "ENOENT" && error.path === "zip"
    ? "Packaging requires the zip command on your PATH."
    : error.message);
  process.exitCode = 1;
});
