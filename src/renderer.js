const $ = selector => document.querySelector(selector);
const palette = ['#d3ed73','#f0a873','#81c8bd','#d189ba','#92a9e7','#e4cf75','#ee8a70'];
let games = [];
let settings = {};
let selectedGameId = null;
const save = async () => {
  try { return await window.chronos.saveData({ schemaVersion: 1, games, settings }); }
  catch(error) { console.error(error); $('#scan-status').textContent='Chronos could not save the library. Check available disk space and permissions.'; throw error; }
};
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render() {
  const query = $('#search').value.trim().toLowerCase(), platform = $('#platform-filter').value;
  const shown = games.filter(g => g.title.toLowerCase().includes(query) && (platform === 'all' || g.platform === platform || (g.sources||[]).some(source=>source.toLowerCase()===platform.toLowerCase()))).sort((a,b) => $('#sort').value === 'az' ? a.title.localeCompare(b.title) : (b.added || 0) - (a.added || 0));
  $('#library-count').textContent = games.length; $('#visible-count').textContent = shown.length;
  $('#game-grid').innerHTML = shown.map((g,i) => {const labels=(g.sources?.length?g.sources:[g.platform]).map(source=>source.charAt(0).toUpperCase()+source.slice(1)).join(' · ');return `<article class="game-card" data-id="${escapeHtml(g.id)}" tabindex="0" role="button" aria-label="Details for ${escapeHtml(g.title)}"><div class="cartridge">${g.art ? `<img src="${escapeHtml(g.art)}" alt="">` : labelArt(g.title,i)}</div><div class="card-info"><div><strong title="${escapeHtml(g.title)}">${escapeHtml(g.title)}</strong><div class="platform-tag">${escapeHtml(labels)}</div></div></div></article>`}).join('');
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
$('#game-form').addEventListener('submit',async event=>{event.preventDefault();const title=$('#game-title').value.trim();if(!title)return;const launch=$('#game-launch').value.trim();if(selectedGameId){const game=games.find(item=>item.id===selectedGameId);if(game){Object.assign(game,{title,platform:$('#game-platform').value,launch,art:$('#game-art').value.trim()});game.launchOptions=launch?[{platform:game.platform,source:game.source||'manual',launch}]:[]}}else games.unshift({id:`manual-${Date.now()}`,title,platform:$('#game-platform').value,source:'manual',sources:['manual'],launch,launchOptions:launch?[{platform:'Manual',source:'manual',launch}]:[],art:$('#game-art').value.trim(),added:Date.now()});await save();render();$('#game-form').reset();$('#add-dialog').close();selectedGameId=null});
function openDetails(id){const game=games.find(item=>item.id===id);if(!game)return;selectedGameId=id;$('#detail-title').textContent=game.title;$('#detail-meta').textContent=[game.platform,(game.sources||[]).join(' · '),game.lastPlayed?`Last played ${new Date(game.lastPlayed).toLocaleString()}`:''].filter(Boolean).join('  /  ');const options=game.launchOptions?.length?game.launchOptions:game.launch?[{platform:game.platform,source:game.source,launch:game.launch}]:[];$('#detail-launch-option').innerHTML=options.map((item,index)=>`<option value="${index}">${escapeHtml(item.platform||item.source||'Launch target')} · ${escapeHtml(item.source||'')}</option>`).join('');$('#detail-launch-option').classList.toggle('hidden',options.length<2);$('#detail-launch-option').dataset.targets=JSON.stringify(options.map(option=>option.launch));$('#detail-target').textContent=options[0]?.launch||'No launch target is set.';$('#detail-status').textContent='';$('#detail-launch').disabled=!options.length;$('#detail-dialog').showModal()}
$('#detail-launch-option').onchange=()=>{const targets=JSON.parse($('#detail-launch-option').dataset.targets||'[]');$('#detail-target').textContent=targets[Number($('#detail-launch-option').value)]||''};
async function launchGame(game){const targets=JSON.parse($('#detail-launch-option').dataset.targets||'[]');const target=targets[Number($('#detail-launch-option').value)]||game.launch;const card=[...$('#game-grid').querySelectorAll('.game-card')].find(item=>item.dataset.id===game.id);if(card)card.classList.add('launching');const dock=$('#dock');$('#dock-title').textContent=game.title;dock.classList.add('show');let result=false;try{result=await window.chronos.launch(target)}catch(error){console.error(error)}if(!result){$('#detail-status').textContent='Chronos could not open this game. Check its launch target or locate the game again.';dock.classList.remove('show');if(card)card.classList.remove('launching');return}game.lastPlayed=Date.now();await save();setTimeout(()=>{if(card)card.classList.remove('launching');dock.classList.remove('show')},1800)}
$('#game-grid').addEventListener('click',event=>{const card=event.target.closest('.game-card');if(card)openDetails(card.dataset.id)});
$('#game-grid').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){const card=event.target.closest('.game-card');if(card){event.preventDefault();openDetails(card.dataset.id)}}});
$('#detail-close').onclick=()=>$('#detail-dialog').close();
$('#detail-launch').onclick=async()=>{const game=games.find(item=>item.id===selectedGameId);if(game)await launchGame(game)};
$('#detail-edit').onclick=()=>{const game=games.find(item=>item.id===selectedGameId);if(!game)return;$('#detail-dialog').close();$('#game-form').reset();$('#game-form h2').textContent='Edit cartridge';$('#game-form button.full-button').textContent='Save changes';$('#game-title').value=game.title;$('#game-platform').value=game.platform;$('#game-launch').value=game.launch||'';$('#game-art').value=game.art||'';$('#add-dialog').showModal()};
$('#detail-remove').onclick=async()=>{games=games.filter(item=>item.id!==selectedGameId);selectedGameId=null;await save();render();$('#detail-dialog').close()};
$('#detail-locate').onclick=async()=>{const target=await window.chronos.pickGame();if(!target)return;const game=games.find(item=>item.id===selectedGameId);if(game){game.launch=target;game.launchOptions=[{platform:game.platform,source:game.source||'manual',launch:target}];await save();openDetails(game.id)}};
$('#add-game').onclick=$('#hero-add').onclick=$('#empty-add').onclick=()=>{selectedGameId=null;$('#game-form').reset();$('#game-form h2').textContent='Add a cartridge';$('#game-form button.full-button').textContent='Add to shelf';$('#add-dialog').showModal()};
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
