# Chronos

Chronos is a cross-platform game launcher prototype with a cartridge shelf, a local collection, launcher scanning, and store shortcuts. It is an independent project inspired by the cartridge-library idea in [Carthage](https://github.com/lopiksaa/carthage); it does not reuse Carthage's code or branding.

## Run from source

Install Node.js 20 or newer, then run:

```sh
npm install
npm start
```

Build artifacts on the matching host with `npm run dist:win` (Windows NSIS installer and portable EXE) or `npm run dist:linux` (AppImage and DEB). Artifacts are written to `release/`; Windows builds are named `*-Setup.exe` and `*-Portable.exe`. GitHub Actions verifies Windows builds on pushes and uploads them with SHA-256 checksums. Pushing a `v<version>` tag matching `package.json` publishes a GitHub Release with the Windows packages and updater metadata. Packaged update checks use GitHub Releases; source runs open the release page. The updater only supports compatible packaged targets.

Run the project checks with `npm test` (31 tests at the current revision).

The first run checks common Steam locations and additional Steam libraries, Epic Games Launcher manifests, Heroic's local GOG/Amazon data, Lutris' library when available, and installed Flatpak applications on Linux. Chronos can connect directly to an Epic account and import owned games, including titles not installed on this PC; Epic authentication sessions are encrypted through OS secure storage. This uses Epic Store endpoints that are not documented as a public third-party library API and may need maintenance if Epic changes them. The official Epic launcher is not needed to read the account library, though some games may still need it or other services to launch. Steam account import is available separately: use Import Steam library from the shelf, save a Steam Web API key in Settings, and provide a public Steam profile URL, vanity name, or SteamID64. Steam only returns the owned games list when game details are visible to the API; if it returns no games, check the profile privacy setting. Steam artwork tries alternate store images before showing the local title label. SteamGridDB cover search uses its documented boolean filters and reports API authorization errors. Flatpak metadata does not consistently identify games, so some non-game apps may be listed. Add games yourself with a title, optional cover image, and optional launch target. The library is stored as a versioned JSON database in Electron's per-user data directory. Existing browser-local collections are migrated on first launch. API keys are encrypted through Electron's OS-backed safe storage when the system keyring is available; Linux systems without a Secret Service/KWallet keyring cannot save keys securely.

On first launch Chronos asks for a store region and offers to scan local launchers. Online API keys remain optional. Uninstallers are configured to preserve Chronos user data.

The Windows NSIS installer and portable build have been generated successfully on Windows with a Chronos icon. Electron uses context isolation, a sandboxed renderer, a restricted preload API, and a local content security policy. Linux packages still need their host build and runtime validation.

## Current scope

- Windows and Linux desktop shell using Electron.
- Local Steam app manifest scanning (including extra libraries), Epic Games Launcher manifests, direct Epic account import, and Heroic GOG/Amazon discovery, Lutris/Flatpak on Linux, and common Windows Riot/Battle.net installs.
- Manual entries and cartridge label artwork when a cover is missing.
- A responsive cartridge shelf with prominent cover art, launcher badges, and compact top navigation.
- Search, platform filtering, favorites, sorting by name/platform/activity, editable game details, launch-target selection, relocalization, remove, and launch status.
- Animated game details with playtime, last opened, install state, launch targets, and Steam achievement progress when the public profile and game provide it.
- Lazy cover loading and generated local labels when artwork is missing or unavailable.
- In-app Steam search with regional prices, discounts, artwork, and official listing links. When Epic catalog search is unavailable, Chronos opens the official Epic browse page in a sandboxed Chronos window; Epic prices remain unavailable.
- Optional Steam library import by SteamID64 and SteamGridDB cover search are available when their keys are saved in OS secure storage. Epic library import uses browser login and refresh tokens saved in OS secure storage.

Heroic Amazon detection depends on Nile local metadata. Riot detection supports products with valid `RiotClientInstalls.json` records (League of Legends, VALORANT, and Legends of Runeterra); Battle.net detection checks common Windows install folders for known games. Nonstandard Windows paths and direct Linux Riot/Battle.net integration are not covered. Steam Web API import requires a 17-digit SteamID64 and a visible games profile. SteamGridDB images selected in Chronos are downloaded to the local user data directory. Epic's public GraphQL endpoint returned HTTP 403 in the Windows check, so Chronos offers its official browse search as a fallback; Epic price comparisons remain unavailable until the service accepts the request. Lutris reads its local SQLite database through Node's built-in SQLite support, with a config-file fallback.

## Windows troubleshooting

- **Steam shows only installed games:** use **Import Steam library** with a saved Web API key and a profile whose game details are public. A local launcher scan does not import uninstalled games.
- **Cover search says no artwork:** open a game's details and choose **Find cover art**. SteamGridDB needs its own saved API key; Steam store images and local title labels remain the fallback.
- **Epic has no in-app results:** the public Epic catalog query currently returns HTTP 403 in the Windows environment. Use the in-app Epic browse window; local Epic installations discovered by Heroic are unaffected.
- **A game does not launch:** verify its launcher is installed and registered with Windows, or use **Locate again** to select its executable.
