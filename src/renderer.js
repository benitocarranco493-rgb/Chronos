const $ = selector => document.querySelector(selector);
const palette = ['#d3ed73','#f0a873','#81c8bd','#d189ba','#92a9e7','#e4cf75','#ee8a70'];
let games = [];
let settings = {};
const save = async () => {
  try { return await window.chronos.saveData({ schemaVersion: 1, games, settings }); }
  catch(error) { console.error(error); $('#scan-status').textContent='Chronos could not save the library. Check available disk space and permissions.'; throw error; }
};
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render() {
  const query = $('#search').value.trim().toLowerCase(), platform = $('#platform-filter').value;
  const shown = games.filter(g => g.title.toLowerCase().includes(query) && (platform === 'all' || g.platform === platform || (g.sources||[]).some(source=>source.toLowerCase()===platform.toLowerCase()))).sort((a,b) => $('#sort').value === 'az' ? a.title.localeCompare(b.title) : (b.added || 0) - (a.added || 0));
  $('#library-count').textContent = games.length; $('#visible-count').textContent = shown.length;
  $('#game-grid').innerHTML = shown.map((g,i) => {const labels=(g.sources?.length?g.sources:[g.platform]).map(source=>source.charAt(0).toUpperCase()+source.slice(1)).join(' · ');return `<article class="game-card" data-id="${escapeHtml(g.id)}"><div class="cartridge">${g.art ? `<img src="${escapeHtml(g.art)}" alt="">` : labelArt(g.title,i)}</div><button class="card-actions remove-game" title="Remove game" data-remove="${escapeHtml(g.id)}">×</button><div class="card-info"><div><strong title="${escapeHtml(g.title)}">${escapeHtml(g.title)}</strong><div class="platform-tag">${escapeHtml(labels)}</div></div></div></article>`}).join('');
  $('#game-grid').querySelectorAll('.cartridge img').forEach((img,index)=>img.onerror=()=>{img.parentElement.innerHTML=labelArt(shown[index].title,index)});
  $('#empty-state').style.display = shown.length ? 'none' : 'block';
}
function labelArt(title,index){const words=title.split(/\s+/);return `<div class="label-art" style="--accent:${palette[index%palette.length]}"><span class="monogram">${escapeHtml(words.slice(0,2).map(x=>x[0]).join('').toUpperCase())}</span><strong>${escapeHtml(title)}</strong><small>GAME CARTRIDGE</small></div>`}
function go(page){document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));$(`#${page}-page`).classList.remove('hidden');document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('#crumb-page').textContent=page==='library'?'COLLECTION':page==='stores'?'STORE BROWSER':'SETTINGS'}
async function scan(){const button=$('#refresh'),status=$('#scan-status');button.disabled=true;button.textContent='Scanning…';status.textContent='Looking for installed games…';try{const discovered=await window.chronos.scanGames();let added=0;for(const game of discovered){const source=game.source||game.platform.toLowerCase();const target=games.find(item=>item.id===game.id)||games.find(item=>item.title.trim().toLocaleLowerCase()===game.title.trim().toLocaleLowerCase());if(target){target.sources=[...new Set([...(target.sources||[target.source||target.platform.toLowerCase()]),source])];target.launchOptions=[...(target.launchOptions||[]),...(target.launch?[{platform:target.platform,source:target.source||target.platform.toLowerCase(),launch:target.launch}]:[]),...(game.launch?[{platform:game.platform,source,launch:game.launch}]:[])].filter((option,index,list)=>list.findIndex(candidate=>candidate.launch===option.launch)===index);if(!target.launch&&game.launch)target.launch=game.launch;continue}game.added=Date.now()+Math.random();game.sources=[source];game.launchOptions=game.launch?[{platform:game.platform,source,launch:game.launch}]:[];games.push(game);added++}await save();render();status.textContent=`Found ${discovered.length} installed game${discovered.length===1?'':'s'} · ${added} added to your shelf`}catch(err){console.error(err);status.textContent='The launcher scan could not finish.'}finally{button.disabled=false;button.textContent='↻  Scan launchers'}}
document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>go(b.dataset.page)));
document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.goto)));
$('#settings-shortcut').onclick=()=>go('settings');
$('#add-game').onclick=$('#hero-add').onclick=$('#empty-add').onclick=()=>$('#add-dialog').showModal();
$('#refresh').onclick=$('#empty-scan').onclick=$('#settings-scan').onclick=scan;
$('#search').oninput=$('#platform-filter').onchange=$('#sort').onchange=render;
$('#choose-launch').onclick=async()=>{const target=await window.chronos.pickGame();if(target)$('#game-launch').value=target};
$('#game-form').addEventListener('submit',async event=>{event.preventDefault();const title=$('#game-title').value.trim();if(!title)return;const launch=$('#game-launch').value.trim();games.unshift({id:`manual-${Date.now()}`,title,platform:$('#game-platform').value,source:'manual',sources:['manual'],launch,launchOptions:launch?[{platform:'Manual',source:'manual',launch}]:[],art:$('#game-art').value.trim(),added:Date.now()});await save();render();$('#game-form').reset();$('#add-dialog').close()});
$('#game-grid').addEventListener('click',async event=>{const remove=event.target.closest('[data-remove]');if(remove){games=games.filter(g=>g.id!==remove.dataset.remove);await save();render();return}const card=event.target.closest('.game-card');if(!card)return;const game=games.find(g=>g.id===card.dataset.id);if(!game?.launch)return;card.classList.add('launching');const dock=$('#dock');$('#dock-title').textContent=game.title;dock.classList.add('show');setTimeout(()=>{card.classList.remove('launching');dock.classList.remove('show')},3500);await window.chronos.launch(game.launch)});
const stores={steam:{title:'Steam Store',description:'Browse new releases, popular games and current discounts.',url:'https://store.steampowered.com/',icon:'S',button:'Open Steam ↗'},epic:{title:'Epic Games Store',description:'Browse the latest PC releases, deals and free games.',url:'https://store.epicgames.com/en-US/',icon:'E',button:'Open Epic Games ↗'}};
document.querySelectorAll('.store-tab').forEach(tab=>tab.onclick=()=>{document.querySelectorAll('.store-tab').forEach(t=>t.classList.toggle('selected',t===tab));const store=stores[tab.dataset.store];$('#store-title').textContent=store.title;$('#store-description').textContent=store.description;$('#store-icon').textContent=store.icon;$('#open-store').textContent=store.button;$('#open-store').dataset.url=store.url});
$('#open-store').onclick=()=>window.chronos.openStore($('#open-store').dataset.url||stores.steam.url);
document.querySelectorAll('.save-key').forEach(button=>button.onclick=async()=>{const input=$(`#${button.dataset.key==='steam'?'steam-key':'sgdb-key'}`);const saved=await window.chronos.saveCredential(button.dataset.key,input.value);if(!saved){$('#credential-status').textContent='Secure key storage is unavailable on this system. Configure a system keyring, then try again.';return}input.value='';$('#credential-status').textContent='Key saved securely on this device.';button.textContent='Saved';setTimeout(()=>button.textContent='Save key',1200)});
async function initialize(){
  try {
    const legacyGames=(()=>{try{return JSON.parse(localStorage.getItem('chronos-games')||'[]')}catch{return []}})();
    const legacySettings={'steam-key':localStorage.getItem('steam-key')||'','sgdb-key':localStorage.getItem('sgdb-key')||''};
    const database=await window.chronos.loadData({games:legacyGames,settings:legacySettings});
    games=database.games;settings=database.settings;
    localStorage.removeItem('chronos-games');
    if(database.credentialsMigrated){localStorage.removeItem('steam-key');localStorage.removeItem('sgdb-key')}
    const credentialStatus=database.credentials;
    $('#steam-key').placeholder=credentialStatus.steam?'Key saved securely · enter to replace':'Optional key';
    $('#sgdb-key').placeholder=credentialStatus.steamgriddb?'Key saved securely · enter to replace':'Optional key';
    if(!credentialStatus.secureStorageAvailable)$('#credential-status').textContent='No secure system keyring is available. Configure Secret Service or KWallet before saving API keys.';
    else if(!database.credentialsMigrated)$('#credential-status').textContent='Your previous key is still in the old local setting and could not be migrated. Set up a system keyring before saving a replacement.';
    render();await scan();
  } catch(error) {
    console.error(error);$('#scan-status').textContent='Chronos could not load its library data.';
  }
}
initialize();
