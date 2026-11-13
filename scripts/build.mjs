import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = join(root, "src");
const dist = join(root, "dist");
const browsers = ["chromium", "firefox"];
// Firefox has no offscreen documents; its background page reads the clipboard itself.
const chromiumOnly = ["background/service-worker.js", "offscreen"];
const firefoxOnly = ["background/firefox.js"];

function zipFolder(folder, archive, entries) {
  execFileSync("zip", ["-q", "-r", "-X", archive, ...entries], { cwd: folder, stdio: "inherit" });
}

async function build() {
  const args = process.argv.slice(2);
  const zip = args.includes("--zip");
  const targets = args.filter((arg) => arg !== "--zip");
  if (targets.length > 1 || targets.some((target) => !browsers.includes(target))) {
    throw new Error("Usage: npm run <build|package> -- [chromium|firefox]");
  }

  const manifest = JSON.parse(await readFile(join(source, "manifest.json"), "utf8"));
  if (typeof manifest.version !== "string" || !/^\d+(\.\d+){0,3}$/.test(manifest.version)) {
    throw new Error("src/manifest.json must have a numeric extension version.");
  }

  await mkdir(dist, { recursive: true });
  const staging = await mkdtemp(join(dist, ".build-"));
  try {
    for (const browser of targets.length ? targets : browsers) {
      const output = join(staging, browser);
      await cp(source, output, { recursive: true, filter: (path) => basename(path) !== ".DS_Store" });
      const browserManifest = { ...manifest };
      if (browser === "chromium") {
        delete browserManifest.browser_specific_settings;
        for (const path of firefoxOnly) await rm(join(output, path), { force: true });
      }
      if (browser === "firefox") {
        browserManifest.background = { scripts: ["background/firefox.js"], type: "module" };
        delete browserManifest.minimum_chrome_version;
        browserManifest.permissions = manifest.permissions.filter((permission) => permission !== "offscreen");
        for (const path of chromiumOnly) await rm(join(output, path), { recursive: true, force: true });
      }
      await writeFile(join(output, "manifest.json"), `${JSON.stringify(browserManifest, null, 2)}\n`);

      if (zip) {
        // Store packages need manifest.json at the root of the archive.
        const archive = `copyhold-${manifest.version}-${browser}.zip`;
        zipFolder(output, join(staging, archive), ["."]);
        await rename(join(staging, archive), join(dist, archive));
        console.log(`Packaged dist/${archive}`);
      }
      if (zip && browser === "chromium") {
        // The GitHub download unzips to a copyhold folder, ready for Load unpacked.
        const download = join(staging, "download");
        await cp(output, join(download, "copyhold"), { recursive: true });
        zipFolder(download, join(staging, "copyhold-chromium.zip"), ["copyhold"]);
        await rename(join(staging, "copyhold-chromium.zip"), join(dist, "copyhold-chromium.zip"));
        console.log("Packaged dist/copyhold-chromium.zip for GitHub releases");
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
