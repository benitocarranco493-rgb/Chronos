# Chronos

Chronos is a cross-platform game launcher prototype with a cartridge shelf, a local collection, launcher scanning, and store shortcuts. It is an independent project inspired by the cartridge-library idea in [Carthage](https://github.com/lopiksaa/carthage); it does not reuse Carthage's code or branding.

## Run from source

Install Node.js 20 or newer, then run:

```sh
npm install
npm start
```

Build release artifacts on the matching host with `npm run dist:win` (Windows NSIS installer and portable EXE) or `npm run dist:linux` (AppImage and DEB). Artifacts are written to `release/`; Windows builds are named `*-Setup.exe` and `*-Portable.exe`. GitHub Actions runs the Windows checks, creates both packages, and uploads them with SHA-256 checksums. Packaged update checks use GitHub Releases; source runs open the release page. The updater only supports compatible packaged targets.

Run the project checks with `npm test` (16 tests at the current revision).

The first run checks common Steam locations and additional Steam libraries, Heroic's local Epic/Legendary and GOG install data, Lutris' library when available, and installed Flatpak applications on Linux. Flatpak metadata does not consistently identify games, so some non-game apps may be listed. Add games yourself with a title, optional cover image, and optional launch target. The library is stored as a versioned JSON database in Electron's per-user data directory. Existing browser-local collections are migrated on first launch. API keys are encrypted through Electron's OS-backed safe storage when the system keyring is available; Linux systems without a Secret Service/KWallet keyring cannot save keys securely.

On first launch Chronos asks for a store region and offers to scan local launchers. Online API keys remain optional. Uninstallers are configured to preserve Chronos user data.

The Windows NSIS installer and portable build have been generated successfully on Windows with a Chronos icon. Electron uses context isolation, a sandboxed renderer, a restricted preload API, and a local content security policy. Linux packages still need their host build and runtime validation.

## Current scope

- Windows and Linux desktop shell using Electron.
- Local Steam app manifest scanning (including extra libraries), Heroic Epic/GOG/Amazon discovery, Lutris/Flatpak on Linux, and common Windows Riot/Battle.net installs.
- Manual entries and cartridge label artwork when a cover is missing.
- Search, platform filtering, favorites, sorting by name/platform/activity, editable game details, launch-target selection, relocalization, remove, and launch status.
- Lazy cover loading and generated local labels when artwork is missing or unavailable.
- In-app Steam search with regional prices, discounts, artwork, and official listing links. Epic falls back to its official search page when its GraphQL endpoint rejects the request.
- Optional Steam library import by SteamID64 and SteamGridDB cover search are available when their keys are saved in OS secure storage.

Heroic Amazon detection depends on Nile local metadata. Riot detection supports products with valid `RiotClientInstalls.json` records (League of Legends, VALORANT, and Legends of Runeterra); Battle.net detection checks common Windows install folders for known games. Nonstandard Windows paths and direct Linux Riot/Battle.net integration are not covered. Steam Web API import requires a 17-digit SteamID64 and a visible games profile. SteamGridDB images selected in Chronos are downloaded to the local user data directory. Epic's public GraphQL endpoint returned HTTP 403 in the Windows check, so Chronos offers its official browse search as a fallback; Epic price comparisons remain unavailable until the service accepts the request. Lutris reads its local SQLite database through Node's built-in SQLite support, with a config-file fallback.
