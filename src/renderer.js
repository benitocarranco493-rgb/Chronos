const $ = selector => document.querySelector(selector);
const palette = ['#d3ed73','#f0a873','#81c8bd','#d189ba','#92a9e7','#e4cf75','#ee8a70'];
let games = JSON.parse(localStorage.getItem('chronos-games') || '[]');
const save = () => localStorage.setItem('chronos-games', JSON.stringify(games));
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render() {
  const query = $('#search').value.trim().toLowerCase(), platform = $('#platform-filter').value;
  const shown = games.filter(g => g.title.toLowerCase().includes(query) && (platform === 'all' || g.platform === platform)).sort((a,b) => $('#sort').value === 'az' ? a.title.localeCompare(b.title) : (b.added || 0) - (a.added || 0));
  $('#library-count').textContent = games.length; $('#visible-count').textContent = shown.length;
  $('#game-grid').innerHTML = shown.map((g,i) => `<article class="game-card" data-id="${escapeHtml(g.id)}"><div class="cartridge">${g.art ? `<img src="${escapeHtml(g.art)}" alt="">` : labelArt(g.title,i)}</div><button class="card-actions remove-game" title="Remove game" data-remove="${escapeHtml(g.id)}">×</button><div class="card-info"><div><strong title="${escapeHtml(g.title)}">${escapeHtml(g.title)}</strong><div class="platform-tag">${escapeHtml(g.platform)}</div></div></div></article>`).join('');
  $('#game-grid').querySelectorAll('.cartridge img').forEach((img,index)=>img.onerror=()=>{img.parentElement.innerHTML=labelArt(shown[index].title,index)});
  $('#empty-state').style.display = shown.length ? 'none' : 'block';
}
function labelArt(title,index){const words=title.split(/\s+/);return `<div class="label-art" style="--accent:${palette[index%palette.length]}"><span class="monogram">${escapeHtml(words.slice(0,2).map(x=>x[0]).join('').toUpperCase())}</span><strong>${escapeHtml(title)}</strong><small>GAME CARTRIDGE</small></div>`}
function go(page){document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));$(`#${page}-page`).classList.remove('hidden');document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('#crumb-page').textContent=page==='library'?'COLLECTION':page==='stores'?'STORE BROWSER':'SETTINGS'}
async function scan(){const button=$('#refresh'),status=$('#scan-status');button.disabled=true;button.textContent='Scanning…';status.textContent='Looking for installed games…';try{const discovered=await window.chronos.scanGames();const ids=new Set(games.map(g=>g.id));let added=0;for(const g of discovered)if(!ids.has(g.id)){g.added=Date.now()+Math.random();games.push(g);added++}save();render();status.textContent=`Found ${discovered.length} installed game${discovered.length===1?'':'s'} · ${added} added to your shelf`}catch(err){console.error(err);status.textContent='The launcher scan could not finish.'}finally{button.disabled=false;button.textContent='↻  Scan launchers'}}
document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>go(b.dataset.page)));
document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.goto)));
$('#settings-shortcut').onclick=()=>go('settings');
$('#add-game').onclick=$('#hero-add').onclick=$('#empty-add').onclick=()=>$('#add-dialog').showModal();
$('#refresh').onclick=$('#empty-scan').onclick=$('#settings-scan').onclick=scan;
$('#search').oninput=$('#platform-filter').onchange=$('#sort').onchange=render;
$('#choose-launch').onclick=async()=>{const target=await window.chronos.pickGame();if(target)$('#game-launch').value=target};
$('#game-form').addEventListener('submit',event=>{event.preventDefault();const title=$('#game-title').value.trim();if(!title)return;games.unshift({id:`manual-${Date.now()}`,title,platform:$('#game-platform').value,launch:$('#game-launch').value.trim(),art:$('#game-art').value.trim(),added:Date.now()});save();render();$('#game-form').reset();$('#add-dialog').close()});
$('#game-grid').addEventListener('click',async event=>{const remove=event.target.closest('[data-remove]');if(remove){games=games.filter(g=>g.id!==remove.dataset.remove);save();render();return}const card=event.target.closest('.game-card');if(!card)return;const game=games.find(g=>g.id===card.dataset.id);if(!game?.launch)return;card.classList.add('launching');const dock=$('#dock');$('#dock-title').textContent=game.title;dock.classList.add('show');setTimeout(()=>{card.classList.remove('launching');dock.classList.remove('show')},3500);await window.chronos.launch(game.launch)});
const stores={steam:{title:'Steam Store',description:'Browse new releases, popular games and current discounts.',url:'https://store.steampowered.com/',icon:'S',button:'Open Steam ↗'},epic:{title:'Epic Games Store',description:'Browse the latest PC releases, deals and free games.',url:'https://store.epicgames.com/en-US/',icon:'E',button:'Open Epic Games ↗'}};
document.querySelectorAll('.store-tab').forEach(tab=>tab.onclick=()=>{document.querySelectorAll('.store-tab').forEach(t=>t.classList.toggle('selected',t===tab));const store=stores[tab.dataset.store];$('#store-title').textContent=store.title;$('#store-description').textContent=store.description;$('#store-icon').textContent=store.icon;$('#open-store').textContent=store.button;$('#open-store').dataset.url=store.url});
$('#open-store').onclick=()=>window.chronos.openStore($('#open-store').dataset.url||stores.steam.url);
document.querySelectorAll('.save-key').forEach(button=>button.onclick=()=>{const input=$(`#${button.dataset.key}`);localStorage.setItem(button.dataset.key,input.value);input.value='';button.textContent='Saved';setTimeout(()=>button.textContent='Save key',1200)});
$('#steam-key').value=localStorage.getItem('steam-key')||'';$('#sgdb-key').value=localStorage.getItem('sgdb-key')||'';
render();scan();
