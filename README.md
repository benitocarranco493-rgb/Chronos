# Chronos

Chronos is a cross-platform game launcher prototype with a cartridge shelf, a local collection, launcher scanning, and store shortcuts. It is an independent project inspired by the cartridge-library idea in [Carthage](https://github.com/lopiksaa/carthage); it does not reuse Carthage's code or branding.

## Run from source

Install Node.js 20 or newer, then run:

```sh
npm install
npm start
```

Run the storage and credential checks with `npm test`.

The first run checks common Steam locations, Heroic's local installed game data, Lutris' library when available, and installed Flatpak apps on Linux. Add games yourself with a title, optional cover image, and optional launch target. The library is stored as a versioned JSON database in Electron's per-user data directory. Existing browser-local collections are migrated on first launch. API keys are encrypted through Electron's OS-backed safe storage when the system keyring is available; Linux systems without a Secret Service/KWallet keyring cannot save keys securely.

## Current scope

- Windows and Linux desktop shell using Electron.
- Local Steam app manifest scanning, Heroic installed game discovery, and Lutris/Flatpak discovery on Linux.
- Manual entries and cartridge label artwork when a cover is missing.
- Search, platform filtering, sorting, remove, and launch.
- Steam and Epic official store shortcuts.
- Optional key storage is OS-encrypted where secure storage is available; API integrations are not wired up yet.

Battle.net and Riot discovery, account library APIs, in-app store search and price comparison, and packaged installers are planned follow-up work. Lutris reads its local SQLite database through Node's built-in SQLite support, with a config-file fallback.
