import fs from "node:fs/promises";
import path from "node:path";

function normalizeVersion(rawVersion) {
  const trimmed = rawVersion.trim();
  const version = trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
  const semverPattern =
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

  if (!semverPattern.test(version)) {
    throw new Error(
      `Invalid version \"${rawVersion}\". Use semantic versions like 1.2.3 or v1.2.3.`,
    );
  }

  return version;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function updateCargoTomlVersion(contents, version) {
  const newline = contents.includes("\r\n") ? "\r\n" : "\n";
  const lines = contents.split(/\r?\n/);
  let inPackageSection = false;
  let updated = false;

  const nextLines = lines.map((line) => {
    if (/^\[package\]\s*$/.test(line)) {
      inPackageSection = true;
      return line;
    }

    if (inPackageSection && /^\[.*\]\s*$/.test(line)) {
      inPackageSection = false;
    }

    if (inPackageSection && /^version\s*=\s*"[^"]+"\s*$/.test(line)) {
      updated = true;
      return `version = "${version}"`;
    }

    return line;
  });

  if (!updated) {
    throw new Error("Could not update version in src-tauri/Cargo.toml.");
  }

  return `${nextLines.join(newline)}${newline}`;
}

const versionArg = process.argv[2];

if (!versionArg) {
  console.error("Usage: npm run version:set -- <version>");
  process.exit(1);
}

const version = normalizeVersion(versionArg);
const rootDir = process.cwd();

const packageJsonPath = path.join(rootDir, "package.json");
const packageLockPath = path.join(rootDir, "package-lock.json");
const tauriConfigPath = path.join(rootDir, "src-tauri", "tauri.conf.json");
const cargoTomlPath = path.join(rootDir, "src-tauri", "Cargo.toml");

const packageJson = await readJson(packageJsonPath);
packageJson.version = version;
await writeJson(packageJsonPath, packageJson);

if (await fileExists(packageLockPath)) {
  const packageLock = await readJson(packageLockPath);
  packageLock.version = version;
  if (packageLock.packages?.[""]) {
    packageLock.packages[""].version = version;
  }
  await writeJson(packageLockPath, packageLock);
}

const tauriConfig = await readJson(tauriConfigPath);
tauriConfig.version = version;
await writeJson(tauriConfigPath, tauriConfig);

const cargoToml = await fs.readFile(cargoTomlPath, "utf8");
const nextCargoToml = updateCargoTomlVersion(cargoToml, version);

await fs.writeFile(cargoTomlPath, nextCargoToml, "utf8");

console.log(
  `Updated package.json, package-lock.json, src-tauri/tauri.conf.json, and src-tauri/Cargo.toml to ${version}`,
);
