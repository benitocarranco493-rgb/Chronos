# Chronos / Carthage feature gap roadmap

Comparison checked on **24 October 2026** against the current `main` branch of [lopiksaa/carthage](https://github.com/lopiksaa/carthage) and Chronos `main` at `ce24ea0`. This plan tracks product capabilities, not Carthage code, assets, logos, or branding. Chronos keeps its own identity and implementation.

## What Chronos already covers

- A combined cartridge library, local discovery for Steam, Epic, Heroic, Lutris and Flatpak, plus Windows Riot and Battle.net discovery and manual entries.
- Search, platform/status filters, favorites, hidden games, and sorting by recent, played, title, and platform.
- Game details, editing, launch targets, cover search, Steam playtime/achievements when available, Epic-owned add-ons, and Steam's public list of DLC available for a game.
- Steam storefront shelves, regional Steam search/prices, current Epic free games, and a sandboxed Epic browse fallback when Epic's catalog API refuses Chronos' in-app query.
- OS-backed credential storage, Windows installer and portable builds, update checks, and GitHub release automation.

## Remaining gaps, by phase

### Phase 1 — Pick a game quickly

- Add a **Surprise me** action that chooses from the games currently visible after search, filters, favorites, and hidden-game settings.
- Avoid choosing the same game twice in a row when there is another eligible game; animate the die and open that game's details.

**Exit criteria:** the choice always comes from the visible library, respects all active filters, and remains usable with keyboard and an empty library.

**Status:** completed. The Library toolbar now has an animated, keyboard-accessible **Surprise me** button. It chooses from the currently visible cards, avoids an immediate repeat when another choice exists, and disables itself when no games match.

### Phase 2 — Organize and browse the library

**Status:** completed. Chronos now caches Steam genres locally and filters by genre, provides launcher/platform narrowing, dedicated Favorites and Play Next views, an editable ordered game queue, saved storefront listings, and a Most played sort. Existing library data migrates to schema 2 automatically.


- Add Steam genre/tag metadata with a local cache and a genre filter; keep the library usable offline and when metadata lookup fails.
- Add launcher-specific library pages and dedicated Favorites and **Play Next** lists.
- Let users add/remove games from Play Next, reorder that list, and bookmark store listings there.
- Add useful library context actions and improve sort choices (most played, launcher, title, recent activity).

**Exit criteria:** users can narrow a large collection by source and genre and maintain a separate ordered list of what to play next.

### Phase 3 — Track actual play sessions

- Record session duration when Chronos launches a game and detect when it exits; combine locally tracked time with provider-reported playtime without double counting.
- Persist last-played/session history and let the user correct a game's total playtime.
- Handle games launched through clients, direct executables, and targets that Chronos cannot observe after handoff.

**Exit criteria:** playtime increases from real sessions, survives restarts, and remains clearly distinguished from imported Steam totals.

### Phase 4 — Enrich game details

- Add cached developer, publisher, release date, tags/family, review summary, and store links when reliable sources provide them.
- Add screenshots and trailers with a gallery and full-size viewer.
- Show global achievement rarity and more useful achievement ordering when Steam provides those values.
- Improve artwork editing with crop/position and per-cartridge label/color controls.

**Exit criteria:** game details provide useful context and media without blocking launch or failing when a provider has no metadata.

### Phase 5 — Complete store discovery and comparison

- Add explicit Deals and Free Now views, sale/price filters, pagination, and richer product details.
- Add an optional IsThereAnyDeal connection for supported shops such as GOG, Microsoft Store, EA, Blizzard, and Epic, with clear source attribution and regional prices.
- Add an in-app wishlist with price comparisons and Play Next integration.
- Retry Epic's in-app catalog search when its endpoint permits it; keep the official Epic browse fallback until then.

**Exit criteria:** store browsing, free offers, deals, wishlist, and price comparisons have clear availability states and never present stale prices as guaranteed.

### Phase 6 — Personalization and tactile controls

- Add appearance choices (light/dark, accent colors, background presets, contrast/transparency) and persist them per user.
- Add adjustable cartridge size, custom cartridge colors, and richer 3D interactions such as drag-to-spin and flip.
- Add optional UI sounds with volume and mute controls, plus reduced-motion and keyboard-navigation preferences.

**Exit criteria:** users can tune the look and interaction intensity without reducing readability or making the library laggy.

### Phase 7 — Presence, onboarding, and support

- Add optional Discord Rich Presence using the local Discord IPC connection, with no game or account data sent through Chronos servers.
- Expand first-run setup into a skippable guided tour and add a concise What's New view after updates.
- Add diagnostics/feedback flows that ask before sending anything and exclude credentials and library secrets.
- Detect relevant local library changes and offer a safe refresh instead of requiring a full manual rescan every time.

**Exit criteria:** integrations are opt-in, setup can be skipped, and diagnostics disclose exactly what would be sent.

### Phase 8 — Windows completion and release hardening

- Validate install, launch, update, uninstall-data preservation, and recovery on clean Windows environments.
- Add UI-level coverage for the main workflows, large-library performance checks, and accessibility/reduced-motion checks.
- Review security boundaries, dependency health, release notes, checksums, and known limitations before calling Windows complete.

**Exit criteria:** a clean Windows install can discover or import a library, launch supported games, update safely, and preserve user data.

### Phase 9 — Linux port and validation

- Resume Linux only after Windows phases are complete, per the project's existing direction.
- Validate provider paths, secure credential storage, launch targets, package install/update behavior, and artwork/media on the target Linux distributions.

**Exit criteria:** supported Linux packages pass equivalent install, library, launch, update, and data-preservation checks.

## Reference features checked in Carthage

- The [README](https://github.com/lopiksaa/carthage#readme) describes the unified launcher and Steam/Epic stores.
- [Library genres and sorting](https://github.com/lopiksaa/carthage/blob/main/carthage/qml/LibraryBar.qml) and [genre metadata lookup](https://github.com/lopiksaa/carthage/blob/main/carthage/genres.py).
- [Playtime tracking](https://github.com/lopiksaa/carthage/blob/main/carthage/playtime.py), [Discord presence](https://github.com/lopiksaa/carthage/blob/main/carthage/discord.py), and [achievement rarity](https://github.com/lopiksaa/carthage/blob/main/carthage/achievements.py).
- [Storefront API integration](https://github.com/lopiksaa/carthage/blob/main/carthage/store.py), [other-store offers](https://github.com/lopiksaa/carthage/blob/main/carthage/shops.py), and [IsThereAnyDeal support](https://github.com/lopiksaa/carthage/blob/main/carthage/itad.py).
- [Random selection control](https://github.com/lopiksaa/carthage/blob/main/carthage/qml/DiceButton.qml), [cartridge interactions](https://github.com/lopiksaa/carthage/blob/main/carthage/qml/TrayCell.qml), [game media gallery](https://github.com/lopiksaa/carthage/blob/main/carthage/qml/MediaGallery.qml), and [first-run experience](https://github.com/lopiksaa/carthage/blob/main/carthage/qml/FirstRun.qml).
