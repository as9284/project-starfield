import fs from "node:fs/promises";
import path from "node:path";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function pickArtifact(bundleDir, matcher) {
  const entries = await fs.readdir(bundleDir, { withFileTypes: true });
  const matches = entries
    .filter((entry) => entry.isFile() && matcher.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  if (matches.length === 0) {
    throw new Error(`No matching artifact found in ${bundleDir}`);
  }

  return matches[matches.length - 1];
}

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, "package.json");
const tauriConfigPath = path.join(rootDir, "src-tauri", "tauri.conf.json");

const packageJson = await readJson(packageJsonPath);
const tauriConfig = await readJson(tauriConfigPath);

const releaseVersion = process.env.RELEASE_VERSION ?? packageJson.version;
const tauriVersion = tauriConfig.version;

if (!releaseVersion) {
  throw new Error("Could not determine release version.");
}

if (tauriVersion !== releaseVersion) {
  throw new Error(
    `Version mismatch: package.json=${releaseVersion}, tauri.conf.json=${tauriVersion}`,
  );
}

const githubRepository = process.env.GITHUB_REPOSITORY;
if (!githubRepository) {
  throw new Error("GITHUB_REPOSITORY is required.");
}

const releaseTag = process.env.RELEASE_TAG ?? `v${releaseVersion}`;
const outputPath = path.resolve(
  process.env.LATEST_JSON_PATH ??
    path.join(rootDir, "release-assets", "latest.json"),
);
const pubDate = process.env.PUBLISH_DATE ?? new Date().toISOString();
const artifactKind = (
  process.env.UPDATER_WINDOWS_ARTIFACT ?? "msi"
).toLowerCase();

if (!["msi", "nsis"].includes(artifactKind)) {
  throw new Error(`Unsupported UPDATER_WINDOWS_ARTIFACT: ${artifactKind}`);
}

let releaseNotes = process.env.RELEASE_NOTES?.trim();
const releaseNotesFile = process.env.RELEASE_NOTES_FILE;
if (!releaseNotes && releaseNotesFile) {
  releaseNotes = (
    await fs.readFile(path.resolve(releaseNotesFile), "utf8")
  ).trim();
}
if (!releaseNotes) {
  releaseNotes = `Release ${releaseTag}`;
}

const productName = String(
  tauriConfig.productName ?? packageJson.name ?? "app",
).replace(/\s+/g, "_");

const bundleDir =
  artifactKind === "msi"
    ? path.join(rootDir, "src-tauri", "target", "release", "bundle", "msi")
    : path.join(rootDir, "src-tauri", "target", "release", "bundle", "nsis");

const installerPattern =
  artifactKind === "msi"
    ? new RegExp(
        `^${escapeRegExp(productName)}_${escapeRegExp(releaseVersion)}_.*_en-US\\.msi$`,
      )
    : new RegExp(
        `^${escapeRegExp(productName)}_${escapeRegExp(releaseVersion)}_.*-setup\\.exe$`,
      );

const installerName = await pickArtifact(bundleDir, installerPattern);
const installerPath = path.join(bundleDir, installerName);
const signaturePath = `${installerPath}.sig`;

if (!(await fileExists(signaturePath))) {
  throw new Error(
    `Missing signature file for updater artifact: ${signaturePath}`,
  );
}

const signature = (await fs.readFile(signaturePath, "utf8")).trim();
const encodedInstallerName = encodeURIComponent(installerName);

const manifest = {
  version: releaseVersion,
  notes: releaseNotes,
  pub_date: pubDate,
  platforms: {
    "windows-x86_64": {
      url: `https://github.com/${githubRepository}/releases/download/${releaseTag}/${encodedInstallerName}`,
      signature,
    },
  },
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(
  outputPath,
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

console.log(`Generated ${outputPath}`);
console.log(`Updater artifact: ${installerPath}`);
