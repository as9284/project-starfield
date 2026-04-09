# Starfield

**Starfield** is an AI-powered desktop app built around a central intelligence called **Luna**. The app is structured as a universe of intelligent features called **Constellations** — each one a self-contained capability that Luna ties together.

Built with [Tauri v2](https://tauri.app), React 19, TypeScript, and Tailwind CSS v4. Luna is powered by **DeepSeek V3** with automatic prefix caching, and optionally augmented with live web search via **Tavily**.

---

## Constellations

| Constellation | Source Project | Status | Description |
| ------------- | -------------- | ------ | ----------- |
| **Luna** | Luna AI | ✅ Active | Central AI companion — ask anything, control every constellation, get instant answers with live web search |
| **Orbit** | Orbit | 🔜 Coming soon | Task management and notes — plan missions, track goals, keep ideas in orbit |
| **Solaris** | Star Weather | 🔜 Coming soon | Weather intelligence — real-time forecasts, 7-day outlooks, atmospheric insights |
| **Beacon** | Beacon | 🔜 Coming soon | Code explorer — import local folders, GitHub repos, and explore codebases with Luna |
| **Pulsar** | Pulsar | 🔜 Coming soon | Media downloader — grab videos, music, and playlists from YouTube |
| **Hyperlane** | Hyperlane | 🔜 Coming soon | URL shortener — collapse long links into compact hyperspace jumps |

---

## Features

- **Luna AI** — DeepSeek V3 (`deepseek-chat`) with streaming responses and automatic prefix caching for fast, cost-efficient conversations
- **Web search** — Tavily integration; toggle web search on in Luna to ground answers in live results
- **Secure key storage** — DeepSeek and Tavily API keys stored in the OS keychain (Windows Credential Manager, macOS Keychain, libsecret on Linux), never written to disk in plain text
- **Cosmic dark-purple UI** — animated star field canvas with shooting stars, frameless transparent window
- **Frameless window** — native-feeling custom title bar with window controls

---

## Prerequisites

- [Node.js](https://nodejs.org) 20+
- [Rust](https://rustup.rs) (stable toolchain)
- [Tauri CLI prerequisites](https://tauri.app/start/prerequisites/) for your platform
- A [DeepSeek API key](https://platform.deepseek.com) (required for Luna)
- A [Tavily API key](https://tavily.com) (optional, for web search)

---

## Getting Started

```bash
# Install dependencies
npm install

# Start the desktop app in development mode
npm run desktop:dev

# Build a production installer
npm run desktop:build
```

---

## Configuration

All API keys are set from the **Settings** page inside the app. They are stored immediately in your OS keychain and never persisted to disk or sent anywhere other than their respective APIs.

| Key | Where to get it | Required |
| --- | --------------- | -------- |
| DeepSeek API Key | [platform.deepseek.com](https://platform.deepseek.com) | ✅ Yes — powers Luna |
| Tavily API Key | [tavily.com](https://tavily.com) | Optional — enables web search in Luna |

---

## Tech Stack

| Layer | Technology |
| ----- | ---------- |
| Desktop shell | Tauri v2 |
| UI | React 19 + TypeScript |
| Styling | Tailwind CSS v4 + custom CSS design tokens |
| State | Zustand v5 with `persist` middleware |
| AI | DeepSeek V3 via OpenAI-compatible REST streaming API |
| Web search | Tavily Search API |
| Keychain | `keyring` crate (native per-platform) |
| Bundler | Vite 7 |

---

## Project Structure

```
starfield/
├── src/                        # React frontend
│   ├── pages/
│   │   ├── Home.tsx            # Starfield home — Constellations hub
│   │   ├── Luna.tsx            # Luna AI chat page
│   │   ├── Orbit.tsx           # Orbit — task management & notes
│   │   ├── Solaris.tsx         # Solaris — weather intelligence
│   │   ├── Beacon.tsx          # Beacon — AI code explorer
│   │   ├── Pulsar.tsx          # Pulsar — media downloader
│   │   ├── Hyperlane.tsx       # Hyperlane — URL shortener
│   │   └── Settings.tsx        # API key management
│   ├── components/
│   │   ├── TitleBar.tsx        # Frameless window title bar + nav
│   │   └── StarField.tsx       # Animated canvas star background
│   ├── store/
│   │   └── useAppStore.ts      # Zustand global state
│   └── lib/
│       ├── tauri.ts            # Tauri IPC bridge
│       └── luna-prompt.ts      # Luna's system prompt & personality
└── src-tauri/                  # Rust backend
    └── src/
        └── commands/
            ├── luna.rs         # DeepSeek streaming chat
            ├── search.rs       # Tavily web search
            └── keychain.rs     # OS keychain key management
```

---

## Luna

Luna is the central AI of Starfield. She has her own personality — sharp, warm, lightly sarcastic, and quietly confident — and she will never reveal what model powers her under the hood.

Her system prompt lives in `src/lib/luna-prompt.ts` and is injected at the start of every conversation. DeepSeek automatically caches the prefix (system prompt + older messages) when the conversation reaches ≥ 1 024 tokens, keeping subsequent turns fast and cheap.

---

## License

MIT