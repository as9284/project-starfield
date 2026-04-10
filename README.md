# Starfield

Starfield is a desktop AI workspace built around Luna and a set of constellation tools. The current app already ships working pages for AI chat, task management, weather, code exploration, media downloads, and URL shortening.

It is built with [Tauri v2](https://tauri.app), React 19, TypeScript, Rust, and Vite. Luna streams responses from DeepSeek, can ground answers with Tavily web search, and can trigger actions across the other constellations from chat.

---

## Current State

| Constellation | Status | What it does now                                                                                                                                              |
| ------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Luna**      | Active | Streaming AI chat, conversation history, markdown replies, memory extraction, optional Tavily web search, and command-style control over other constellations |
| **Orbit**     | Active | Local task and note management with priorities, due dates, archiving, and persisted state                                                                     |
| **Solaris**   | Active | Location search, current conditions, hourly charts, 7-day forecast, and geolocation-based weather lookup                                                      |
| **Beacon**    | Active | Import local folders or public GitHub repositories, index file trees, preload source snippets, and chat about the codebase                                    |
| **Pulsar**    | Active | Download video, audio, and playlists with yt-dlp, choose quality, set output folder, and pause, resume, retry, or cancel downloads                            |
| **Hyperlane** | Active | Shorten URLs with saved history and quick copy/open actions                                                                                                   |

Settings also includes API key management, updater checks and installs, yt-dlp status and auto-install, memory export/import, and keyboard shortcut help.

---

## Highlights

- **Luna AI**: streaming chat powered by DeepSeek via the `deepseek-chat` model
- **Live web search**: Tavily-backed results when web search is enabled in Luna
- **Constellation actions**: Luna can create Orbit items, fetch Solaris weather, shorten URLs, queue Pulsar downloads, and navigate between constellations
- **Code exploration**: Beacon can scan local folders through the Rust backend or inspect public GitHub repositories through the GitHub API
- **Weather UI**: Solaris uses Open-Meteo plus geocoding and reverse geocoding for forecasts and location detection
- **Download manager**: Pulsar auto-installs yt-dlp when possible, tracks progress, and persists recent download history
- **In-app updates**: Settings is wired to `@tauri-apps/plugin-updater` and can download and install published releases
- **Secure key storage**: API keys are stored in the OS keychain, not in plain-text project files
- **Desktop shell**: frameless transparent Tauri window with a custom title bar and keyboard shortcuts

---

## Prerequisites

- [Node.js](https://nodejs.org) 20+
- [Rust](https://rustup.rs) stable
- [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your platform
- A [DeepSeek API key](https://platform.deepseek.com) for Luna and Beacon chat
- A [Tavily API key](https://tavily.com) if you want Luna web search

---

## Getting Started

```bash
# Install dependencies
npm install

# Start the desktop app in development mode
npm run desktop:dev

# Build the frontend only
npm run web:build

# Build a signed desktop release
npm run desktop:build
```

---

## Release Builds

Updater artifacts are enabled for production builds, so Tauri requires the updater signing private key in your shell environment before `tauri build` or `npm run desktop:build` will succeed.

On Windows PowerShell:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = (Resolve-Path "src-tauri/keys/starfield.key").Path
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
# If your key uses a password, replace the empty string with that value.

npm run desktop:build
```

Tauri reads the signing key from environment variables at build time. `.env` files are not used for updater signing.

For the current Windows build, the release artifacts are written under:

- `src-tauri/target/release/bundle/msi/`
- `src-tauri/target/release/bundle/nsis/`

### Automated GitHub Releases

This repo now includes a GitHub Actions workflow at `.github/workflows/release.yml` that will:

- build the Windows release on `windows-latest`
- sign updater artifacts using your GitHub repository secrets
- generate `latest.json`
- create or update the GitHub release for the version tag
- upload the MSI, NSIS, `.sig`, and `latest.json` assets

Before you use it, add these repository secrets in GitHub:

- `TAURI_SIGNING_PRIVATE_KEY`: the full contents of `src-tauri/keys/starfield.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: optional; set it only if the key has a password

How to publish a release:

1. Update `package.json` and `src-tauri/tauri.conf.json` to the new version.
2. Commit and push those changes.
3. Create a tag that matches the version exactly, for example `v1.0.1`.
4. Push the tag: `git push origin v1.0.1`.
5. Wait for the `Release` workflow to finish.
6. The workflow will publish the GitHub release and upload `latest.json` plus the Windows installers.

You can also rerun the workflow manually from the Actions tab with an existing tag. Manual runs let you choose whether `latest.json` points to the MSI or NSIS asset. The default is MSI.

---

## Configuration

All runtime API keys are managed from the **Settings** page and stored in the OS keychain.

| Key              | Used for                                             | Required |
| ---------------- | ---------------------------------------------------- | -------- |
| DeepSeek API key | Luna chat and Beacon code chat                       | Yes      |
| Tavily API key   | Luna web search                                      | Optional |
| Weather API key  | Optional Open-Meteo commercial or higher-limit usage | Optional |

Solaris currently works against Open-Meteo without requiring a key for normal usage.

---

## Publishing Updates To GitHub Releases

The updater endpoint in `src-tauri/tauri.conf.json` points to:

```text
https://github.com/as9284/project-starfield/releases/latest/download/latest.json
```

That means the update flow only works when the latest published GitHub release contains:

1. `latest.json`
2. The installer file referenced inside `latest.json`

For the current static JSON updater flow, uploading the `.sig` file itself is **not required by the client** because the signature is embedded in `latest.json`. You still need the generated `.sig` file locally so you can copy its contents into the manifest, and it is reasonable to upload it alongside the release for traceability.

### Recommended Windows x64 release assets

Minimum required:

- `latest.json`
- `Starfield_<version>_x64_en-US.msi`

Recommended extras:

- `Starfield_<version>_x64_en-US.msi.sig`
- `Starfield_<version>_x64-setup.exe`
- `Starfield_<version>_x64-setup.exe.sig`

Important:

- `latest.json` can reference only one `windows-x86_64` installer URL, so pick one Windows installer pair for the updater manifest.
- If you point `latest.json` at the MSI, use the contents of the MSI `.sig` file.
- If you point `latest.json` at the NSIS EXE, use the contents of the EXE `.sig` file.
- Do not mix an MSI URL with an EXE signature, or the updater check will fail.
- The bundle directories may still contain older artifacts from previous builds. Upload only the files for the version you are releasing.
- Keep the version aligned across `package.json`, `src-tauri/tauri.conf.json`, and `latest.json`.

### Example `latest.json`

This example uses the MSI build:

```json
{
  "version": "1.0.0",
  "notes": "Bug fixes and feature updates.",
  "pub_date": "2026-04-10T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "url": "https://github.com/as9284/project-starfield/releases/download/v1.0.0/Starfield_1.0.0_x64_en-US.msi",
      "signature": "PASTE_THE_CONTENTS_OF_Starfield_1.0.0_x64_en-US.msi.sig_HERE"
    }
  }
}
```

If you prefer the NSIS installer for updates, swap both the `url` and the `signature` to the `Starfield_<version>_x64-setup.exe` pair instead.

Because the app checks `releases/latest/download/latest.json`, the release must be published, not left as a draft. The included release workflow handles that automatically.

---

## Tech Stack

| Layer           | Technology                                                  |
| --------------- | ----------------------------------------------------------- |
| Desktop shell   | Tauri v2                                                    |
| Frontend        | React 19 + TypeScript                                       |
| Styling         | Tailwind CSS v4 + custom CSS variables                      |
| Animation       | Framer Motion                                               |
| State           | Zustand with `persist` middleware                           |
| AI backend      | DeepSeek chat completions over streaming HTTP               |
| Web search      | Tavily Search API                                           |
| Weather         | Open-Meteo forecast and geocoding APIs                      |
| Code indexing   | Rust local scanner plus GitHub API fetches for public repos |
| Media downloads | yt-dlp orchestrated from Rust commands                      |
| Key storage     | Rust `keyring` crate                                        |
| Bundler         | Vite 7                                                      |

---

## Project Structure

```text
starfield/
├── src/
│   ├── components/
│   │   ├── AiGlobe.tsx
│   │   ├── ConstellationOverlay.tsx
│   │   ├── CosmicLogo.tsx
│   │   ├── StarField.tsx
│   │   └── TitleBar.tsx
│   ├── lib/
│   │   ├── luna-prompt.ts
│   │   ├── memory.ts
│   │   ├── platform.ts
│   │   ├── tauri.ts
│   │   ├── weather-types.ts
│   │   └── weather.ts
│   ├── pages/
│   │   ├── Beacon.tsx
│   │   ├── Hyperlane.tsx
│   │   ├── Luna.tsx
│   │   ├── Orbit.tsx
│   │   ├── Pulsar.tsx
│   │   ├── Settings.tsx
│   │   └── Solaris.tsx
│   └── store/
│       ├── useAppStore.ts
│       ├── useBeaconStore.ts
│       ├── useHyperlaneStore.ts
│       ├── useOrbitStore.ts
│       ├── usePulsarStore.ts
│       └── useSolarisStore.ts
└── src-tauri/
        ├── tauri.conf.json
        ├── keys/
        └── src/
                ├── lib.rs
                └── commands/
                        ├── beacon.rs
                        ├── keychain.rs
                        ├── luna.rs
                        ├── pulsar.rs
                        └── search.rs
```

---

## License

MIT
