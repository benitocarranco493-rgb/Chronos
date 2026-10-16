# Chronos

Chronos is a cross-platform game launcher prototype with a cartridge shelf, a local collection, launcher scanning, and store shortcuts. It is an independent project inspired by the cartridge-library idea in [Carthage](https://github.com/lopiksaa/carthage); it does not reuse Carthage's code or branding.

## Run from source

Install Node.js 20 or newer, then run:

```sh
npm install
npm start
```

The first run checks Steam's common install locations and, on Linux, installed Flatpak apps. Add games yourself with a title, optional cover image, and optional launch target. Collection data and optional keys are stored in the app's local browser storage.

## Current scope

- Windows and Linux desktop shell using Electron.
- Local Steam app manifest scanning; Flatpak discovery on Linux.
- Manual entries and cartridge label artwork when a cover is missing.
- Search, platform filtering, sorting, remove, and launch.
- Steam and Epic official store shortcuts.
- Optional key fields are stored locally; API integrations are not wired up yet.

Heroic, Lutris, Battle.net and Riot discovery, account library APIs, in-app store search and price comparison, secure OS credential storage, and packaged installers are planned follow-up work.
