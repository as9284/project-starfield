import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

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

function parseArgs(argv) {
  let versionArg = null;
  let publish = false;
  let remote = "origin";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--publish") {
      publish = true;
      continue;
    }

    if (arg === "--remote") {
      remote = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--remote=")) {
      remote = arg.slice("--remote=".length);
      continue;
    }

    if (!versionArg) {
      versionArg = arg;
      continue;
    }

    throw new Error(`Unexpected argument: ${arg}`);
  }

  return { versionArg, publish, remote };
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error(
      [`Command failed: ${command} ${args.join(" ")}`, stderr || stdout]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return result.stdout?.trim() ?? "";
}

function tryCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

function ensureCleanWorkingTree(rootDir) {
  const status = runCommand("git", ["status", "--porcelain"], { cwd: rootDir });
  if (status) {
    throw new Error(
      `Release publish requires a clean git working tree before version bumping.\nCommit or stash existing changes first.\n\n${status}`,
    );
  }
}

function ensureRemoteExists(rootDir, remote) {
  if (!remote) {
    throw new Error("A git remote name is required.");
  }

  runCommand("git", ["remote", "get-url", remote], { cwd: rootDir });
}

function getCurrentBranch(rootDir) {
  const branch = runCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: rootDir,
  });

  if (!branch || branch === "HEAD") {
    throw new Error(
      "Release publish must run from a named branch, not detached HEAD.",
    );
  }

  return branch;
}

function ensureTagDoesNotExist(rootDir, tag, remote) {
  const localTagCheck = tryCommand(
    "git",
    ["rev-parse", "-q", "--verify", `refs/tags/${tag}`],
    { cwd: rootDir },
  );
  if (localTagCheck.status === 0) {
    throw new Error(`Git tag ${tag} already exists locally.`);
  }

  const remoteTagOutput = runCommand(
    "git",
    ["ls-remote", "--tags", "--refs", remote, `refs/tags/${tag}`],
    { cwd: rootDir },
  );
  if (remoteTagOutput) {
    throw new Error(`Git tag ${tag} already exists on remote ${remote}.`);
  }
}

function ensureVersionFilesChanged(rootDir) {
  const diffCheck = tryCommand("git", ["diff", "--cached", "--quiet"], {
    cwd: rootDir,
  });

  if (diffCheck.status === 0) {
    throw new Error("Requested version is already set. Nothing to publish.");
  }

  if (diffCheck.status !== 1) {
    const stderr = diffCheck.stderr?.trim();
    throw new Error(stderr || "Unable to inspect staged version changes.");
  }
}

const { versionArg, publish, remote } = parseArgs(process.argv.slice(2));

if (!versionArg) {
  console.error(
    "Usage: npm run version:set -- <version>\n       npm run release:publish -- <version>",
  );
  process.exit(1);
}

const version = normalizeVersion(versionArg);
const rootDir = process.cwd();
const versionFiles = [
  "package.json",
  "package-lock.json",
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock",
];

if (publish) {
  ensureCleanWorkingTree(rootDir);
  ensureRemoteExists(rootDir, remote);
  ensureTagDoesNotExist(rootDir, `v${version}`, remote);
}

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

if (!publish) {
  console.log(
    `Updated package.json, package-lock.json, src-tauri/tauri.conf.json, and src-tauri/Cargo.toml to ${version}`,
  );
  process.exit(0);
}

const tag = `v${version}`;
const branch = getCurrentBranch(rootDir);

runCommand("git", ["add", ...versionFiles], { cwd: rootDir });
ensureVersionFilesChanged(rootDir);
runCommand("git", ["commit", "-m", `chore: release ${tag}`], { cwd: rootDir });
runCommand("git", ["tag", "-a", tag, "-m", `Release ${tag}`], { cwd: rootDir });
runCommand("git", ["push", remote, branch], { cwd: rootDir });
runCommand("git", ["push", remote, tag], { cwd: rootDir });

console.log(`Published ${tag} from ${branch} to ${remote}.`);
console.log(
  "The GitHub Actions release workflow should now build the app, sign it, generate latest.json, and publish the release assets.",
);
