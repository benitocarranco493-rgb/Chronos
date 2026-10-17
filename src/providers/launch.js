const { execFile: systemExecFile } = require('node:child_process');

function createGameLauncher({ platform = process.platform, shell, findRiotClient, findBattleNetClient, execFile = systemExecFile }) {
  return async function launchGame(target) {
    if (typeof target !== 'string' || !target) return false;

    const riot = target.match(/^riot:\/\/launch\/(league_of_legends|valorant|bacon)\/([a-z0-9_-]+)$/i);
    const battleNet = target.match(/^battlenet:\/\/launch\/(wow|pro|fen|d3|osi|s2|hs|w3)$/i);
    if (platform === 'win32' && (riot || battleNet)) {
      const executable = riot ? findRiotClient() : findBattleNetClient();
      if (!executable) return false;
      const args = riot
        ? [`--launch-product=${riot[1].toLowerCase()}`, `--launch-patchline=${riot[2]}`]
        : [`--exec=launch ${battleNet[1].toLowerCase()}`];
      return new Promise(resolve => execFile(executable, args, { windowsHide: true }, error => resolve(!error)));
    }

    if (/^https?:\/\//i.test(target) || /^(steam|epic|heroic|com\.heroicgameslauncher\.|com\.epicgames\.launcher|lutris):\/\//i.test(target) || /^lutris:rungame\//i.test(target)) {
      try { await shell.openExternal(target); return true; } catch { return false; }
    }

    if (platform === 'win32') {
      try { return !(await shell.openPath(target)); } catch { return false; }
    }

    const parts = target.match(/(?:"([^"]*)"|'([^']*)'|\S+)/g) || [];
    const bin = (parts.shift() || '').replace(/^(?:"|')|(?:"|')$/g, '');
    const args = parts.map(part => part.replace(/^(?:"|')|(?:"|')$/g, ''));
    return new Promise(resolve => execFile(bin, args, error => resolve(!error)));
  };
}

module.exports = { createGameLauncher };
