(function exposeLibraryModel(root) {
  function isManual(game) {
    return game.source === 'manual' || game.id?.startsWith('manual-');
  }

  function mergeDiscoveredGames(currentGames, discoveredGames, { detected = false } = {}) {
    const games = currentGames.map(game => ({ ...game }));
    let added = 0;
    const pendingDlcs = [];
    const normalizeTitle = title => String(title || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, '').toLocaleLowerCase();
    function attachDlc(dlc) {
      const baseTitle = normalizeTitle(dlc.baseGameTitle);
      if (!baseTitle) return false;
      const parent = games.find(item => normalizeTitle(item.title) === baseTitle && !item.isDlc);
      if (!parent) return false;
      const child = { id: dlc.id, title: dlc.title, art: dlc.art || '', source: dlc.source || 'epic-account' };
      parent.dlcs = [...(parent.dlcs || []).filter(item => item.id !== child.id), child];
      const standaloneIndex = games.findIndex(item => item.id === child.id);
      if (standaloneIndex !== -1) games.splice(standaloneIndex, 1);
      return true;
    }

    for (const discovered of discoveredGames) {
      const game = { ...discovered };
      if (detected && game.installed === undefined) game.installed = true;
      const source = game.source || game.platform.toLowerCase();
      if (game.isDlc) {
        if (!attachDlc(game)) pendingDlcs.push(game);
        continue;
      }
      const target = games.find(item => item.id === game.id)
        || games.find(item => !isManual(item) && item.title.trim().toLocaleLowerCase() === game.title.trim().toLocaleLowerCase());

      if (target) {
        if (detected && game.installed !== false) target.installed = true;
        target.sources = [...new Set([...(target.sources || [target.source || target.platform.toLowerCase()]), source])];
        target.launchOptions = [...(target.launchOptions || []), ...(target.launch ? [{ platform: target.platform, source: target.source || target.platform.toLowerCase(), launch: target.launch }] : []), ...(game.launch ? [{ platform: game.platform, source, launch: game.launch }] : [])]
          .filter((option, index, list) => list.findIndex(candidate => candidate.launch === option.launch) === index);
        if (!target.launch && game.launch) target.launch = game.launch;
        const epicId = String(target.id || '').replace(/^epic(?:-account)?-/, '');
        const targetTitleIsEpicPlaceholder = target.title === epicId || target.title === `Epic game ${epicId}` || target.title === 'Epic game (name unavailable)';
        const discoveredTitleIsUseful = game.title && !/^Epic game\s*\(/i.test(game.title) && game.title !== game.id?.replace(/^epic-account-/, '');
        if (source === 'epic-account' && (targetTitleIsEpicPlaceholder || !target.title)) target.title = discoveredTitleIsUseful ? game.title : 'Epic game (name unavailable)';
        if (game.art && !target.art) target.art = game.art;
        if (game.playtimeKnown) {
          target.playtimeMinutes = Number.isFinite(game.playtimeMinutes) ? game.playtimeMinutes : 0;
          target.playtimeKnown = true;
        }
        continue;
      }

      game.added = Number.isFinite(game.added) ? game.added : Date.now() + Math.random();
      game.sources = [source];
      game.launchOptions = game.launch ? [{ platform: game.platform, source, launch: game.launch }] : [];
      games.push(game);
      added++;
    }

    for (const dlc of pendingDlcs) attachDlc(dlc);

    return { games, added };
  }

  root.ChronosLibrary = { mergeDiscoveredGames };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ChronosLibrary;
})(globalThis);
