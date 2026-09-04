/**
 * CHRONUS — Character Sheet Legacy Engine (v0.6.1)
 * Encapsulamento de alta fidelidade da Ficha Digital Oficial.
 * ARQUITETURA CONSOLIDADA: Consome ChronusAuth como única autoridade de autenticação.
 * ISOLAMENTO DE STORAGE: Chaves de cache e dirty separadas por user_id.
 * PRESERVAÇÃO TOTAL: Coordenadas (1449x2048), bindings, marcadores, IndexedDB e renderização.
 */
window.ChronusSheetEngine = (function() {
  'use strict';



  const W = 1449;
  const H = 2048;
  const STORAGE_KEY = 'chronus.sheet.v4';
  const LEGACY_KEYS = ['chronus.sheet.v3', 'chronus.sheet.v2', 'chronus.sheet.v1'];

  // Supabase — chave publicável (segura para uso no navegador com RLS habilitado)
  const SUPABASE_URL = 'https://phxqtkdumgwacrqsflqe.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nl4ksY4d4ZFWENQ1_93wQQ_MXHih6uK';
  const CLOUD_USER_KEY = 'chronus.cloud.user.v1';
  const CLOUD_CHARACTER_KEY = 'chronus.cloud.character.v1';
  const CLOUD_DIRTY_KEY = 'chronus.cloud.dirty.v1';
  const CLOUD_SYNCED_KEY = 'chronus.cloud.synced.v1';
  const PORTRAIT_DIRTY_KEY = 'chronus.cloud.portrait.dirty.v1';
  const NARRATOR_VIEW_DATA_KEY = 'chronus.narrator.view.data.v1';
  const NARRATOR_VIEW_META_KEY = 'chronus.narrator.view.meta.v1';
  const WOUND_STATES = ['empty', 'slash', 'x', 'star'];
  const ARCANA = ['Morte', 'Destino', 'Forças', 'Vida', 'Matéria', 'Mente', 'Primórdio', 'Espaço', 'Espírito', 'Tempo'];
  const POLARITIES = {
    Vida: 'Morte', Morte: 'Vida', Mente: 'Matéria', Matéria: 'Mente',
    Tempo: 'Espaço', Espaço: 'Tempo', Destino: 'Forças', Forças: 'Destino',
    Espírito: 'Primórdio', Primórdio: 'Espírito'
  };

  const ATTRIBUTE_POINTS = {
    'Força': [[83.5,623.5],[91.5,595.5],[183.5,589.5],[197.5,614.5],[197.5,644.5],[182.5,670.5],[100.5,673.5],[85.5,649.5]],
    'Vigor': [[275.5,623.5],[283.5,595.5],[373.5,589.5],[387.5,614.5],[385.5,644.5],[372.5,670.5],[291.5,672.5],[276.5,649.5]],
    'Destreza': [[460.5,624.5],[467.5,596.5],[556.5,590.5],[570.5,615.5],[569.5,644.5],[556.5,670.5],[478.5,673.5],[463.5,651.5]],
    'Razão': [[81.5,797.5],[87.5,770.5],[180.5,764.5],[193.5,789.5],[193.5,819.5],[179.5,846.5],[97.5,848.5],[83.5,824.5]],
    'Astúcia': [[271.5,798.5],[279.5,771.5],[372.5,764.5],[384.5,790.5],[382.5,819.5],[369.5,846.5],[287.5,848.5],[273.5,825.5]],
    'Perseverança': [[457.5,799.5],[465.5,771.5],[556.5,765.5],[568.5,790.5],[567.5,819.5],[554.5,846.5],[474.5,848.5],[459.5,825.5]],
    'Manipulação': [[81.5,972.5],[88.5,946.5],[179.5,939.5],[192.5,964.5],[191.5,994.5],[177.5,1020.5],[97.5,1022.5],[83.5,998.5]],
    'Presença': [[270.5,973.5],[278.5,946.5],[368.5,941.5],[381.5,966.5],[380.5,995.5],[367.5,1021.5],[286.5,1023.5],[271.5,999.5]],
    'Vontade': [[458.5,975.5],[466.5,947.5],[554.5,941.5],[566.5,967.5],[565.5,996.5],[552.5,1022.5],[473.5,1023.5],[459.5,1000.5]]
  };

  const MANA_POINTS = [
    [1022.5,950.5],[1059.5,950.5],[1098.5,950.5],[1136.5,950.5],[1173.5,948.5],[1210.5,950.5],[1247.5,950.5],[1285.5,947.5],[1323.5,950.5],[1360.5,950.5],
    [1022.5,1005.5],[1060.5,1007.5],[1098.5,1007.5],[1136.5,1005.5],[1173.5,1007.5],[1210.5,1007.5],[1247.5,1007.5],[1285.5,1007.5],[1323.5,1004.5],[1360.5,1007.5]
  ];

  const SKILL_Y = [1125.5,1154.5,1184.5,1213.5,1242.5,1271.5,1301.5,1330.5,1359.5,1388.5,1417.5,1446.5,1475.5,1504.5,1533.5,1562.5];
  const ADV_Y = [1651.5,1679.5,1707.5,1735.5,1764.5,1792.5,1821.5];
  const ARCANA_ROW_Y = [1239,1269,1299,1329,1359,1389,1419,1448,1478,1508];
  const ARCANA_DEG_X = [1220,1256.5,1292.5,1329,1364];

  const defaultState = {
    identity: { name:'', profession:'', player:'', tradition:'', concept:'', chronicle:'' },
    personalities: ['', ''],
    magic: { paradigm:'', practice:'', instruments:'' },
    attributes: Object.fromEntries(Object.keys(ATTRIBUTE_POINTS).map(name => [name, ''])),
    illumination: 'd4',
    protection: '',
    pain: false,
    conditions: '',
    equipmentImportant: '',
    xp: { current:'', spent:'' },
    markers: {},
    paradox: 0,
    arcanaMajor: '',
    arcanaInferior: '',
    lists: {
      skills: Array.from({length:16}, () => ({ marker:'empty', text:'' })),
      advantages: Array.from({length:7}, () => ({ marker:'empty', text:'' })),
      equipment: Array.from({length:4}, () => ({ name:'', damage:'', type:'', properties:'' })),
      formulas: Array.from({length:3}, () => ({ name:'', notes:'' })),
      arcana: Object.fromEntries(ARCANA.map(a => [a, Array(5).fill('empty')]))
    },
    page2: { formulas:Array(12).fill(''), inventory:Array(16).fill(''), history:'' },
    activePage: 'page-1'
  };

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function mergeDeep(target, source) {
    if (!source || typeof source !== 'object') return target;
    Object.entries(source).forEach(([k,v]) => {
      if (Array.isArray(v)) target[k] = v;
      else if (v && typeof v === 'object') {
        if (!target[k] || typeof target[k] !== 'object') target[k] = {};
        mergeDeep(target[k], v);
      } else target[k] = v;
    });
    return target;
  }
  function normalizeState(s) {
    if (!s.attributes || typeof s.attributes !== 'object') s.attributes = {};
    Object.keys(ATTRIBUTE_POINTS).forEach(name => {
      const value = String(s.attributes[name] || '').toLowerCase();
      s.attributes[name] = ['d4','d6','d8','d10'].includes(value) ? value : '';
    });

    if (!s.markers || typeof s.markers !== 'object') s.markers = {};
    Object.entries(s.markers).forEach(([key,value]) => {
      if (key.startsWith('wounds.')) {
        s.markers[key] = WOUND_STATES.includes(value) ? value : 'empty';
      } else if (key.startsWith('attribute.')) {
        delete s.markers[key];
      } else {
        s.markers[key] = value && value !== 'empty' ? 'filled' : 'empty';
      }
    });

    while (s.lists.skills.length < 16) s.lists.skills.push({marker:'empty',text:''});
    s.lists.skills = s.lists.skills.slice(0,16).map(item => ({
      marker: item?.marker && item.marker !== 'empty' ? 'filled' : 'empty',
      text: item?.text || ''
    }));
    while (s.lists.advantages.length < 7) s.lists.advantages.push({marker:'empty',text:''});
    s.lists.advantages = s.lists.advantages.slice(0,7).map(item => ({
      marker: item?.marker && item.marker !== 'empty' ? 'filled' : 'empty',
      text: item?.text || ''
    }));
    while (s.lists.equipment.length < 4) s.lists.equipment.push({name:'',damage:'',type:'',properties:''});
    s.lists.equipment = s.lists.equipment.slice(0,4);
    while (s.lists.formulas.length < 3) s.lists.formulas.push({name:'',notes:''});
    s.lists.formulas = s.lists.formulas.slice(0,3);
    if (!s.lists.arcana) s.lists.arcana = {};
    ARCANA.forEach(a => {
      if (!Array.isArray(s.lists.arcana[a])) s.lists.arcana[a] = Array(5).fill('empty');
      while (s.lists.arcana[a].length < 5) s.lists.arcana[a].push('empty');
      s.lists.arcana[a] = s.lists.arcana[a].slice(0,5).map(v => v && v !== 'empty' ? 'filled' : 'empty');
    });
    if (!s.page2) s.page2 = clone(defaultState.page2);
    while (s.page2.formulas.length < 12) s.page2.formulas.push('');
    while (s.page2.inventory.length < 16) s.page2.inventory.push('');
    return s;
  }
  function loadState() {
    const base = clone(defaultState);
    try {
      const params = new URLSearchParams(location.search);
      if (params.get('narratorView') === '1') {
        const snapshot = sessionStorage.getItem(NARRATOR_VIEW_DATA_KEY);
        if (snapshot) return normalizeState(mergeDeep(base, JSON.parse(snapshot)));
      }
      const raw = localStorage.getItem(STORAGE_KEY) || LEGACY_KEYS.map(k => localStorage.getItem(k)).find(Boolean);
      return normalizeState(raw ? mergeDeep(base, JSON.parse(raw)) : base);
    } catch { return base; }
  }
  const state = loadState();
  let saveTimer = 0;
  let cloudSaveTimer = 0;
  let supabaseClient = null;
  let cloudUser = null;
  let cloudCharacterId = null;
  let cloudReady = false;
  let cloudSaving = false;
  let cloudSaveAgain = false;
  let bootstrapInProgress = false;
  let currentProfile = null;
  let narratorReadOnly = false;
  let narratorViewMeta = null;
  let passwordRecoveryMode = false;
  let passwordRecoveryAuthorized = false;
  const indicator = document.getElementById('saveIndicator');

  function setSaveStatus(text, mode='') {
    if (!indicator) return;
    let clean=String(text||'').replace(/^Offline\s*[•·-]\s*/i,'').replace(/^Online\s*[•·-]\s*/i,'');
    let prefix='';
    if(mode==='cloud') prefix='● Online · ';
    else if(mode==='offline') prefix='● Offline · ';
    else if(mode==='saving') prefix=(navigator.onLine ? '● Online · ' : '● Offline · ');
    indicator.textContent = prefix + clean;
    indicator.title = mode==='offline' ? 'Sem conexão com a nuvem. As alterações ficam protegidas neste dispositivo até a internet voltar.' : 'Conexão com a nuvem CHRONUS';
    indicator.classList.toggle('is-saving', mode === 'saving');
    indicator.classList.toggle('is-cloud', mode === 'cloud');
    indicator.classList.toggle('is-offline', mode === 'offline');
  }

  function persistLocalState(markDirty=true) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      if (markDirty) localStorage.setItem(CLOUD_DIRTY_KEY, '1');
    } catch (e) { console.warn('CHRONUS: falha ao salvar localmente', e); }
  }

  function scheduleCloudSave(delay=1200) {
    clearTimeout(cloudSaveTimer);
    if (!cloudReady || !cloudUser || !cloudCharacterId) return;
    if (!navigator.onLine) {
      setSaveStatus('Offline • salvo local', 'offline');
      return;
    }
    cloudSaveTimer = setTimeout(() => pushStateToCloud(), delay);
  }

  function scheduleSave() {
    if (narratorReadOnly) return;
    window.dispatchEvent(new CustomEvent('chronus:sheet-updated'));
    setSaveStatus('Salvando…', 'saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      persistLocalState(true);
      if (cloudUser) {
        setSaveStatus(navigator.onLine ? 'Salvo local • sincronizando…' : 'Offline • salvo local', navigator.onLine ? 'saving' : 'offline');
        scheduleCloudSave();
      } else {
        setSaveStatus('Salvo neste dispositivo');
      }
    }, 180);
  }

  function getRollProfile() {
    const attributes = Object.entries(state.attributes || {})
      .map(([name, die]) => ({ name, die: String(die || '').toLowerCase(), sides: Number(String(die || '').replace('d', '')) }))
      .filter(attribute => [4, 6, 8, 10].includes(attribute.sides));
    const personalities = (state.personalities || [])
      .map(value => String(value || '').trim())
      .filter(Boolean);
    const skills = (state.lists?.skills || [])
      .map(item => String(item?.text || '').trim())
      .filter(Boolean);
    const determination = [0, 1, 2].filter(index => state.markers?.[`determination.${index}`] === 'filled').length;

    return clone({
      characterName: String(state.identity?.name || '').trim(),
      attributes,
      personalities,
      skills,
      determination,
      paradox: Math.max(0, Number(state.paradox) || 0),
      readOnly: narratorReadOnly
    });
  }

  function spendDetermination() {
    if (narratorReadOnly) return { ok: false, error: 'Ficha em modo somente leitura.' };
    const spentIndex = [2, 1, 0].find(index => state.markers?.[`determination.${index}`] === 'filled');
    if (spentIndex === undefined) return { ok: false, error: 'Sem Determinação disponível.' };
    state.markers[`determination.${spentIndex}`] = 'empty';
    const marker = document.querySelector(`[aria-label="determination.${spentIndex}"]`);
    if (marker) marker.dataset.state = 'empty';
    scheduleSave();
    return { ok: true, remaining: getRollProfile().determination };
  }

  function dischargeParadox(expectedValue, nextValue) {
    if (narratorReadOnly) return { ok: false, error: 'Ficha em modo somente leitura.' };
    const expected = Math.max(0, Number(expectedValue) || 0);
    const next = Math.max(0, Number(nextValue) || 0);
    if ((Number(state.paradox) || 0) !== expected) return { ok: false, error: 'O Paradoxo da ficha mudou. Atualize o rolador.' };
    state.paradox = next;
    document.querySelectorAll('#paradoxLayer .paradox-hit').forEach(marker => {
      const label = marker.getAttribute('aria-label')?.replace('Paradoxo ', '');
      const value = label === '21+' ? 21 : Number(label);
      marker.classList.toggle('is-active', value === next);
    });
    scheduleSave();
    return { ok: true, paradox: next };
  }

  function getByPath(obj, path) { return path.split('.').reduce((a,k) => a?.[k], obj); }
  function setByPath(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    let ref = obj;
    keys.forEach(k => { if (!(k in ref)) ref[k] = /^\d+$/.test(k) ? [] : {}; ref = ref[k]; });
    ref[last] = value;
  }
  function pctX(x) { return `${(x/W)*100}%`; }
  function pctY(y) { return `${(y/H)*100}%`; }
  function placeBox(el, x,y,w,h) {
    el.style.left = pctX(x); el.style.top = pctY(y); el.style.width = pctX(w); el.style.height = pctY(h);
  }
  function applyDataBoxes() {
    document.querySelectorAll('[data-box]').forEach(el => {
      const [x,y,w,h] = el.dataset.box.split(',').map(Number);
      placeBox(el,x,y,w,h);
    });
  }

  function binaryMarker({x,y,size=30,key,shape='',onChange}) {
    const b = document.createElement('button');
    b.type='button'; b.className=`marker binary-marker ${shape}`.trim();
    b.dataset.state = state.markers[key] === 'filled' ? 'filled' : 'empty';
    b.style.left=pctX(x); b.style.top=pctY(y); b.style.width=pctX(size); b.style.height=pctY(size);
    b.style.transform='translate(-50%,-50%)';
    b.setAttribute('aria-label', key);
    b.addEventListener('click', () => {
      const n = b.dataset.state === 'filled' ? 'empty' : 'filled';
      b.dataset.state=n; state.markers[key]=n; onChange?.(n); scheduleSave();
    });
    return b;
  }

  function nextWoundState(current) {
    const i = WOUND_STATES.indexOf(current);
    return WOUND_STATES[(i + 1) % WOUND_STATES.length];
  }

  function woundMarker({x,y,size=30,key}) {
    const b = document.createElement('button');
    b.type='button'; b.className='marker wound-marker square';
    b.dataset.state = WOUND_STATES.includes(state.markers[key]) ? state.markers[key] : 'empty';
    b.style.left=pctX(x); b.style.top=pctY(y); b.style.width=pctX(size); b.style.height=pctY(size);
    b.style.transform='translate(-50%,-50%)';
    b.setAttribute('aria-label', key);
    b.addEventListener('click', () => {
      const n = nextWoundState(b.dataset.state);
      b.dataset.state=n; state.markers[key]=n; scheduleSave();
    });
    return b;
  }

  function bindInputs() {
    document.querySelectorAll('[data-bind]').forEach(el => {
      const path = el.dataset.bind;
      const value = getByPath(state,path);
      el.value = value ?? '';
      el.addEventListener('input', () => { setByPath(state,path,el.value); scheduleSave(); });
    });
  }

  function renderAttributes() {
    const host=document.getElementById('attributeLayer');
    Object.entries(ATTRIBUTE_POINTS).forEach(([name,pts]) => {
      const centerX = pts.reduce((sum,p)=>sum+p[0],0) / pts.length;
      const centerY = pts.reduce((sum,p)=>sum+p[1],0) / pts.length;
      const select=document.createElement('select');
      select.className='attribute-die-select';
      select.setAttribute('aria-label',`${name}: dado do atributo`);
      placeBox(select,centerX-35,centerY-22,70,44);
      select.innerHTML='<option value="">—</option><option value="d4">d4</option><option value="d6">d6</option><option value="d8">d8</option><option value="d10">d10</option>';
      select.value=state.attributes[name] || '';
      select.addEventListener('change',()=>{state.attributes[name]=select.value;scheduleSave();});
      host.append(select);
    });
  }

  function renderResources() {
    const host=document.getElementById('resourceLayer');
    [[87,1143],[148,1143],[208,1143]].forEach((p,i) => host.append(binaryMarker({x:p[0],y:p[1],size:48,key:`determination.${i}`,shape:'diamond'})));

    const illum = [['d4',291.5],['d6',341.5],['d8',388.5],['d10',431.5]];
    illum.forEach(([value,x]) => {
      const b=document.createElement('button'); b.type='button'; b.className='illumination-hit';
      placeBox(b,x-18,1138,36,36); b.classList.toggle('is-active',state.illumination===value);
      b.setAttribute('aria-label',`Iluminação ${value}`);
      b.addEventListener('click',()=>{
        state.illumination=value;
        host.querySelectorAll('.illumination-hit').forEach(n=>n.classList.toggle('is-active',n.getAttribute('aria-label')===`Iluminação ${value}`));
        scheduleSave();
      }); host.append(b);
    });
  }

  function renderMana() {
    const host=document.getElementById('manaLayer');
    MANA_POINTS.forEach((p,i)=>host.append(binaryMarker({x:p[0],y:p[1],size:31,key:`mana.${i}`})));
  }

  function renderWounds() {
    const host=document.getElementById('woundsLayer');
    const centers=[78.5,103.5,129.5,155,179.5,205,231,256.5,280.5,304.5];
    centers.forEach((x,i)=>host.append(woundMarker({x,y:1316,size:28,key:`wounds.${i}`})));
    const pain=document.createElement('button'); pain.type='button'; pain.className='pain-hit'; placeBox(pain,167,1368,34,38);
    pain.classList.toggle('is-active',!!state.pain); pain.setAttribute('aria-label','Dor');
    pain.addEventListener('click',()=>{state.pain=!state.pain; pain.classList.toggle('is-active',state.pain); scheduleSave();}); host.append(pain);
  }

  function renderList(hostId, rows, type) {
    const host=document.getElementById(hostId); const items=state.lists[type];
    rows.forEach((y,i)=>{
      const m = binaryMarker({x:679.5,y,size:29,key:`${type}.${i}`,onChange:n=>{items[i].marker=n;}});
      m.dataset.state=items[i].marker==='filled'?'filled':'empty'; host.append(m);
      const input=document.createElement('input'); input.className='list-marker-input'; input.value=items[i].text||''; placeBox(input,704,y-12,223,24);
      input.setAttribute('aria-label',`${type} ${i+1}`); input.addEventListener('input',()=>{items[i].text=input.value;scheduleSave();}); host.append(input);
    });
  }

  function renderParadox() {
    const host=document.getElementById('paradoxLayer');
    const xBounds1=[1005,1039,1072,1106,1139,1173,1206,1239,1273,1307,1340,1380];
    const xBounds2=[1005,1039,1072,1106,1139,1173,1206,1239,1273,1307,1380];
    const make=(label,value,x1,x2,y1,y2)=>{
      const b=document.createElement('button'); b.type='button'; b.className='paradox-hit'; placeBox(b,x1,y1,x2-x1,y2-y1);
      b.classList.toggle('is-active',state.paradox===value); b.setAttribute('aria-label',`Paradoxo ${label}`);
      b.addEventListener('click',()=>{state.paradox=state.paradox===value?0:value; host.querySelectorAll('.paradox-hit').forEach(n=>n.classList.remove('is-active')); if(state.paradox)b.classList.add('is-active'); scheduleSave();}); host.append(b);
    };
    for(let i=0;i<11;i++) make(String(i+1),i+1,xBounds1[i],xBounds1[i+1],1084,1117);
    for(let i=0;i<10;i++) make(i===9?'21+':String(i+12),i+12,xBounds2[i],xBounds2[i+1],1117,1150);
  }

  function syncArcanaAffinity(host) {
    state.arcanaInferior = state.arcanaMajor ? POLARITIES[state.arcanaMajor] : '';
    host.querySelectorAll('.arcana-affinity').forEach(b=>{
      const arc=b.dataset.arcana, kind=b.dataset.kind;
      b.classList.toggle('is-major',kind==='major' && arc===state.arcanaMajor);
      b.classList.toggle('is-inferior',kind==='inferior' && arc===state.arcanaInferior);
    });
  }
  function renderArcana() {
    const host=document.getElementById('arcanaLayer');
    ARCANA.forEach((arc,row)=>{
      const y=ARCANA_ROW_Y[row];
      ['major','inferior'].forEach((kind,idx)=>{
        const b=document.createElement('button'); b.type='button'; b.className='arcana-affinity'; b.dataset.arcana=arc; b.dataset.kind=kind;
        placeBox(b,idx===0?1082:1140,y-15,idx===0?58:61,30); b.setAttribute('aria-label',`${arc} ${kind}`);
        if(kind==='major') b.addEventListener('click',()=>{state.arcanaMajor=state.arcanaMajor===arc?'':arc; syncArcanaAffinity(host); scheduleSave();});
        host.append(b);
      });
      ARCANA_DEG_X.forEach((x,i)=>{
        const key=`arcana.${arc}.${i}`;
        const m=binaryMarker({x,y,size:25,key,onChange:n=>{state.lists.arcana[arc][i]=n;}}); m.dataset.state=state.lists.arcana[arc][i]==='filled'?'filled':'empty'; host.append(m);
      });
    });
    syncArcanaAffinity(host);
  }

  function renderEquipment() {
    const host=document.getElementById('equipmentLayer');
    const cols=[
      ['name',50,208],['damage',212,309],['type',314,405],['properties',410,615]
    ];
    const ys=[[1494,1525],[1526,1558],[1559,1591],[1592,1624]];
    state.lists.equipment.forEach((item,r)=>cols.forEach(([key,x1,x2])=>{
      const input=document.createElement('input'); input.className='table-input'; input.value=item[key]||''; placeBox(input,x1,ys[r][0],x2-x1,ys[r][1]-ys[r][0]);
      input.setAttribute('aria-label',`${key} equipamento ${r+1}`); input.addEventListener('input',()=>{item[key]=input.value;scheduleSave();}); host.append(input);
    }));
  }

  function renderFormulas() {
    const host=document.getElementById('formulasLayer');
    const rows=[
      {name:[1164,1614,200,27],notes:[1042,1642,322,47]},
      {name:[1164,1700,200,27],notes:[1042,1728,322,47]},
      {name:[1164,1788,200,27],notes:[1042,1816,322,47]}
    ];
    state.lists.formulas.forEach((item,i)=>{
      const n=document.createElement('input'); n.className='table-input formula-name'; n.value=item.name||''; placeBox(n,...rows[i].name); n.setAttribute('aria-label',`Fórmula ${i+1} nome`); n.addEventListener('input',()=>{item.name=n.value;scheduleSave();}); host.append(n);
      const t=document.createElement('textarea'); t.className='table-input formula-notes'; t.value=item.notes||''; placeBox(t,...rows[i].notes); t.setAttribute('aria-label',`Fórmula ${i+1} notas`); t.addEventListener('input',()=>{item.notes=t.value;scheduleSave();}); host.append(t);
    });
  }

  function renderPage2() {
    const makeLines=(hostId,arr,count)=>{
      const host=document.getElementById(hostId); while(arr.length<count)arr.push('');
      for(let i=0;i<count;i++){
        const input=document.createElement('input'); input.value=arr[i]||''; input.setAttribute('aria-label',`${hostId} ${i+1}`);
        input.addEventListener('input',()=>{arr[i]=input.value;scheduleSave();}); host.append(input);
      }
    };
    makeLines('page2Formulas',state.page2.formulas,12); makeLines('page2Inventory',state.page2.inventory,16);
  }

  // IndexedDB do retrato, com fallback em localStorage
  const DB_NAME='chronus-sheet-db-v3', STORE='assets';
  function openDb(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
  async function dbPut(blob){const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(blob,'portrait');tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
  async function dbGet(){const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly');const r=tx.objectStore(STORE).get('portrait');r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error);});}
  async function dbDelete(){const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete('portrait');tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
  function blobToDataUrl(blob){return new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=rej;fr.readAsDataURL(blob);});}
  async function savePortrait(blob){try{await dbPut(blob);}catch{try{localStorage.setItem('chronus.portrait.fallback',await blobToDataUrl(blob));}catch{}}}
  async function loadPortrait(){try{return await dbGet();}catch{const d=localStorage.getItem('chronus.portrait.fallback');return d||null;}}
  async function clearPortrait(){try{await dbDelete();}catch{} localStorage.removeItem('chronus.portrait.fallback');}
  async function setupPortrait(){
    const button=document.getElementById('portraitButton'), input=document.getElementById('portraitInput'), preview=document.getElementById('portraitPreview'), action=document.getElementById('portraitAction');
    let objectUrl='';
    const show=(data)=>{if(objectUrl)URL.revokeObjectURL(objectUrl); if(typeof data==='string')preview.src=data; else {objectUrl=URL.createObjectURL(data);preview.src=objectUrl;} preview.hidden=false;button.classList.add('has-portrait');};
    window.__chronusShowPortrait = show;
    const saved=await loadPortrait().catch(()=>null); if(saved)show(saved);
    const choose=()=>input.click(); button.addEventListener('click',choose); action.addEventListener('click',choose);
    input.addEventListener('change',async()=>{
      const file=input.files?.[0]; if(!file)return;
      if(file.size>12*1024*1024){alert('Use uma imagem de até 12 MB.');return;}
      await savePortrait(file); show(file); localStorage.setItem(PORTRAIT_DIRTY_KEY,'1');
      if(cloudUser && cloudReady && navigator.onLine) await pushPortraitToCloud(file);
    });
    button.addEventListener('contextmenu',async(e)=>{
      e.preventDefault();
      if(!preview.hidden&&confirm('Remover o retrato?')){
        await clearPortrait(); preview.hidden=true; preview.src=''; button.classList.remove('has-portrait');
        localStorage.setItem(PORTRAIT_DIRTY_KEY,'1');
        if(cloudUser && cloudReady && navigator.onLine) await deletePortraitFromCloud();
      }
    });
  }


  function cloudCharacterName() {
    return String(state?.identity?.name || '').trim() || 'Novo personagem';
  }

  async function pushStateToCloud() {
    if (!supabaseClient || !cloudUser || !cloudCharacterId || !cloudReady) return;
    if (!navigator.onLine) { setSaveStatus('Offline • salvo local', 'offline'); return; }
    if (cloudSaving) { cloudSaveAgain = true; return; }

    cloudSaving = true;
    setSaveStatus('Sincronizando…', 'saving');
    try {
      const { data, error } = await supabaseClient
        .from('characters')
        .update({ name: cloudCharacterName(), data: clone(state) })
        .eq('id', cloudCharacterId)
        .eq('user_id', cloudUser.id)
        .select('updated_at')
        .single();
      if (error) throw error;
      localStorage.setItem(CLOUD_DIRTY_KEY, '0');
      localStorage.setItem(CLOUD_SYNCED_KEY, data?.updated_at || new Date().toISOString());
      setSaveStatus('Salvo na nuvem ✓', 'cloud');
    } catch (e) {
      console.error('CHRONUS: erro de sincronização', e);
      localStorage.setItem(CLOUD_DIRTY_KEY, '1');
      setSaveStatus('Nuvem indisponível • salvo local', 'offline');
    } finally {
      cloudSaving = false;
      if (cloudSaveAgain) { cloudSaveAgain = false; scheduleCloudSave(250); }
    }
  }

  async function pushPortraitToCloud(fileOrBlob) {
    if (!supabaseClient || !cloudUser || !navigator.onLine) return false;
    try {
      const { error } = await supabaseClient.storage
        .from('portraits')
        .upload(`${cloudUser.id}/portrait`, fileOrBlob, {
          upsert: true,
          contentType: fileOrBlob.type || 'image/jpeg',
          cacheControl: '3600'
        });
      if (error) throw error;
      localStorage.setItem(PORTRAIT_DIRTY_KEY,'0');
      setSaveStatus('Retrato salvo na nuvem ✓', 'cloud');
      return true;
    } catch (e) {
      console.warn('CHRONUS: retrato salvo apenas localmente (bucket portraits pode ainda não estar configurado)', e);
      localStorage.setItem(PORTRAIT_DIRTY_KEY,'1');
      setSaveStatus('Retrato salvo localmente', 'offline');
      return false;
    }
  }

  async function pullPortraitFromCloud() {
    if (!supabaseClient || !cloudUser || !navigator.onLine) return;
    try {
      const { data, error } = await supabaseClient.storage.from('portraits').download(`${cloudUser.id}/portrait`);
      if (error) return; // bucket/arquivo ainda pode não existir
      if (data) {
        await savePortrait(data);
        window.__chronusShowPortrait?.(data);
        localStorage.setItem(PORTRAIT_DIRTY_KEY,'0');
      }
    } catch (e) { console.warn('CHRONUS: não foi possível baixar o retrato', e); }
  }

  async function deletePortraitFromCloud() {
    if (!supabaseClient || !cloudUser || !navigator.onLine) return;
    try {
      const { error } = await supabaseClient.storage.from('portraits').remove([`${cloudUser.id}/portrait`]);
      if (error) throw error;
      localStorage.setItem(PORTRAIT_DIRTY_KEY,'0');
    } catch (e) { console.warn('CHRONUS: não foi possível remover o retrato na nuvem', e); }
  }

  function showAuthGate(message='', isError=false) {
    const gate=document.getElementById('authGate'), msg=document.getElementById('authMessage');
    if (msg) { msg.textContent=message; msg.classList.toggle('is-error',isError); }
    if (gate) gate.hidden=false;
    setTimeout(()=>document.getElementById('authEmail')?.focus(),50);
  }

  function hideAuthGate() {
    const gate=document.getElementById('authGate'); if(gate) gate.hidden=true;
    const msg=document.getElementById('authMessage'); if(msg){msg.textContent='';msg.classList.remove('is-error');}
  }

  function passwordRedirectUrl() {
    const url=new URL(location.href);
    url.hash=''; url.search=''; url.searchParams.set('passwordReset','1');
    return url.toString();
  }

  function getPasswordRecoveryCallback() {
    const url=new URL(location.href);
    const hashParams=new URLSearchParams((url.hash||'').replace(/^#/,''));
    const pick=(key)=>hashParams.get(key) || url.searchParams.get(key) || '';
    return {
      requested: url.searchParams.get('passwordReset')==='1',
      error: pick('error'),
      errorCode: pick('error_code'),
      errorDescription: pick('error_description')
    };
  }

  function clearPasswordRecoveryUrl() {
    const url=new URL(location.href);
    url.searchParams.delete('passwordReset');
    url.searchParams.delete('error');
    url.searchParams.delete('error_code');
    url.searchParams.delete('error_description');
    url.hash='';
    history.replaceState({},'',url.pathname + (url.searchParams.toString()?('?'+url.searchParams.toString()):''));
  }

  function showPasswordGate(mode='change', message='') {
    passwordRecoveryMode = mode==='recovery';
    const gate=document.getElementById('passwordGate');
    const title=document.getElementById('passwordTitle');
    const subtitle=document.getElementById('passwordSubtitle');
    const msg=document.getElementById('passwordMessage');
    if(title) title.textContent=passwordRecoveryMode ? 'Criar nova senha' : 'Alterar senha';
    if(subtitle) subtitle.textContent=passwordRecoveryMode ? 'Link de recuperação validado. Escolha sua nova senha.' : 'Atualize a senha da sua conta CHRONUS.';
    if(msg){msg.textContent=message;msg.classList.remove('is-error');}
    if(gate) gate.hidden=false;
    setTimeout(()=>document.getElementById('newPassword')?.focus(),50);
  }

  function hidePasswordGate() {
    const gate=document.getElementById('passwordGate'); if(gate) gate.hidden=true;
    const form=document.getElementById('passwordForm'); form?.reset();
    const msg=document.getElementById('passwordMessage'); if(msg){msg.textContent='';msg.classList.remove('is-error');}
    if(passwordRecoveryMode) clearPasswordRecoveryUrl();
    passwordRecoveryMode=false;
    passwordRecoveryAuthorized=false;
  }

  function relativeSyncLabel(value) {
    if(!value) return {text:'Sem sincronização', stale:true};
    const t=new Date(value).getTime();
    if(!Number.isFinite(t)) return {text:'Sincronizada', stale:false};
    const mins=Math.max(0,Math.floor((Date.now()-t)/60000));
    if(mins<2) return {text:'Atualizada há pouco', stale:false};
    if(mins<60) return {text:`Atualizada há ${mins} min`, stale:mins>15};
    const hrs=Math.floor(mins/60);
    if(hrs<24) return {text:`Atualizada há ${hrs} h`, stale:true};
    const days=Math.floor(hrs/24);
    return {text:`Atualizada há ${days} dia${days===1?'':'s'}`, stale:true};
  }

  function updateAccountUi(user) {
    const label=document.getElementById('cloudUserLabel');
    const account=document.getElementById('accountButton');
    const logout=document.getElementById('logoutButton');
    const passwordButton=document.getElementById('passwordButton');
    if(user){
      const display=currentProfile?.display_name || (user.email ? user.email.split('@')[0] : 'Conta CHRONUS');
      const suffix=currentProfile?.role==='narrator' ? ' · Narrador' : '';
      if(label){label.textContent=display+suffix;label.title=user.email||display;label.hidden=false;}
      if(account) account.hidden=true;
      if(logout) logout.hidden=false;
      if(passwordButton) passwordButton.hidden=false;
    } else {
      if(label){label.textContent='';label.title='';label.hidden=true;}
      if(account) account.hidden=false;
      if(logout) logout.hidden=true;
      if(passwordButton) passwordButton.hidden=true;
    }
  }

  function statesEqual(a,b) {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
  }

  async function applyRemoteAndReload(remoteData, userId, characterId, updatedAt) {
    const merged = normalizeState(mergeDeep(clone(defaultState), remoteData || {}));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    localStorage.setItem(CLOUD_USER_KEY, userId);
    localStorage.setItem(CLOUD_CHARACTER_KEY, characterId);
    localStorage.setItem(CLOUD_DIRTY_KEY, '0');
    localStorage.setItem(CLOUD_SYNCED_KEY, updatedAt || new Date().toISOString());
    location.reload();
  }

  async function bootstrapCloudForUser(user) {
    if (!supabaseClient || !user || bootstrapInProgress) return;
    bootstrapInProgress = true;
    cloudReady = false;
    cloudUser = user;
    updateAccountUi(user);
    hideAuthGate();
    setSaveStatus('Conectando à nuvem…', 'saving');

    try {
      const { data: row, error } = await supabaseClient
        .from('characters')
        .select('id,name,data,updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending:false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;

      const localOwner = localStorage.getItem(CLOUD_USER_KEY);
      const dirty = localStorage.getItem(CLOUD_DIRTY_KEY) === '1';

      if (!row) {
        // Primeira migração: se ainda não havia dono local, envia a ficha v0.3/v0.4 atual.
        // Se o navegador pertencia a outra conta, cria uma ficha limpa para evitar vazamento entre jogadores.
        const initialState = localOwner && localOwner !== user.id ? clone(defaultState) : clone(state);
        if (!String(initialState?.identity?.player || '').trim() && currentProfile?.display_name) initialState.identity.player = currentProfile.display_name;
        const { data: created, error: insertError } = await supabaseClient
          .from('characters')
          .insert({ user_id:user.id, name:String(initialState?.identity?.name||'').trim()||'Novo personagem', data:initialState })
          .select('id,updated_at')
          .single();
        if (insertError) throw insertError;
        cloudCharacterId = created.id;
        localStorage.setItem(CLOUD_USER_KEY, user.id);
        localStorage.setItem(CLOUD_CHARACTER_KEY, created.id);
        localStorage.setItem(CLOUD_DIRTY_KEY, '0');
        localStorage.setItem(CLOUD_SYNCED_KEY, created.updated_at || new Date().toISOString());
        cloudReady = true;
        if (localOwner && localOwner !== user.id) {
          await applyRemoteAndReload(initialState,user.id,created.id,created.updated_at);
          return;
        }
        setSaveStatus('Salvo na nuvem ✓', 'cloud');
      } else {
        cloudCharacterId = row.id;
        localStorage.setItem(CLOUD_CHARACTER_KEY, row.id);

        if (localOwner && localOwner !== user.id) {
          await applyRemoteAndReload(row.data,user.id,row.id,row.updated_at);
          return;
        }
        if (!localOwner) {
          // Dispositivo novo: se há ficha na nuvem, a nuvem é a fonte principal.
          await applyRemoteAndReload(row.data,user.id,row.id,row.updated_at);
          return;
        }

        cloudReady = true;
        localStorage.setItem(CLOUD_USER_KEY, user.id);
        if (dirty) {
          await pushStateToCloud();
        } else {
          const remoteNormalized = normalizeState(mergeDeep(clone(defaultState), row.data || {}));
          if (!statesEqual(remoteNormalized, state)) {
            await applyRemoteAndReload(row.data,user.id,row.id,row.updated_at);
            return;
          }
          localStorage.setItem(CLOUD_SYNCED_KEY,row.updated_at||new Date().toISOString());
          setSaveStatus('Salvo na nuvem ✓', 'cloud');
        }
      }

      // Retrato: se existe alteração local pendente, envia; caso contrário tenta recuperar da nuvem.
      const portraitDirty = localStorage.getItem(PORTRAIT_DIRTY_KEY) === '1';
      if (portraitDirty) {
        const localPortrait = await loadPortrait().catch(()=>null);
        if(localPortrait) await pushPortraitToCloud(localPortrait);
      } else {
        await pullPortraitFromCloud();
      }
    } catch (e) {
      console.error('CHRONUS: falha ao iniciar a nuvem', e);
      cloudReady = false;
      setSaveStatus('Nuvem indisponível • salvo local', 'offline');
    } finally {
      bootstrapInProgress = false;
    }
  }


  async function getCurrentProfile(user) {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('id,display_name,email,role')
      .eq('id', user.id)
      .single();
    if (error) throw error;
    return data;
  }

  function clearNarratorModes() {
    document.body.classList.remove('narrator-dashboard','narrator-readonly');
    const panel=document.getElementById('narratorPanel'); if(panel) panel.hidden=true;
  }

  function formatUpdatedAt(value) {
    if(!value) return 'Ainda não sincronizada';
    try { return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)); }
    catch { return value; }
  }

  async function loadNarratorDashboard() {
    const panel=document.getElementById('narratorPanel');
    const grid=document.getElementById('narratorGrid');
    const loading=document.getElementById('narratorLoading');
    const errorBox=document.getElementById('narratorError');
    if(!panel || !grid) return;

    document.body.classList.add('narrator-dashboard');
    document.body.classList.remove('narrator-readonly');
    panel.hidden=false; grid.hidden=true; loading.hidden=false; errorBox.hidden=true;
    setSaveStatus('Painel do Narrador','cloud');

    try {
      const { data: players, error: playersError } = await supabaseClient
        .from('profiles')
        .select('id,display_name,email,role')
        .eq('role','player')
        .order('display_name',{ascending:true});
      if(playersError) throw playersError;

      const ids=(players||[]).map(p=>p.id);
      let characters=[];
      if(ids.length){
        const { data, error } = await supabaseClient
          .from('characters')
          .select('id,user_id,name,data,updated_at')
          .in('user_id',ids)
          .order('updated_at',{ascending:false});
        if(error) throw error;
        characters=data||[];
      }
      const newestByUser=new Map();
      for(const c of characters){ if(!newestByUser.has(c.user_id)) newestByUser.set(c.user_id,c); }

      grid.innerHTML='';
      for(const player of players||[]){
        const character=newestByUser.get(player.id)||null;
        const card=document.createElement('article'); card.className='narrator-card';
        const safeName=player.display_name||player.email||'Jogador';
        const charName=character?.name || 'Ficha ainda não iniciada';
        card.innerHTML=`<h3></h3><div class="player-email"></div>${character
          ? '<div class="character-name"></div><div class="sync-badge"></div><div class="character-meta"></div><button type="button">Abrir ficha</button>'
          : '<div class="empty-character">Este jogador ainda não entrou na ficha online. A ficha será criada automaticamente no primeiro login.</div><button type="button" disabled>Aguardando primeiro login</button>'}`;
        card.querySelector('h3').textContent=safeName;
        card.querySelector('.player-email').textContent=player.email||'';
        if(character){
          card.querySelector('.character-name').textContent=charName;
          const sync=relativeSyncLabel(character.updated_at);
          const badge=card.querySelector('.sync-badge'); if(badge){badge.textContent=sync.text;badge.classList.toggle('stale',sync.stale);}
          card.querySelector('.character-meta').textContent='Última sincronização: '+formatUpdatedAt(character.updated_at);
          card.querySelector('button').addEventListener('click',()=>openNarratorCharacter(player,character));
        }
        grid.append(card);
      }
      if(!(players||[]).length){
        const empty=document.createElement('div'); empty.className='narrator-loading'; empty.textContent='Nenhum jogador cadastrado.'; grid.append(empty);
      }
      loading.hidden=true; grid.hidden=false;
    } catch(e) {
      console.error('CHRONUS: erro no painel do narrador',e);
      loading.hidden=true; errorBox.hidden=false; errorBox.textContent='Não foi possível carregar as fichas: '+(e?.message||e);
    }
  }

  function openNarratorCharacter(player, character) {
    sessionStorage.setItem(NARRATOR_VIEW_DATA_KEY, JSON.stringify(character?.data || {}));
    sessionStorage.setItem(NARRATOR_VIEW_META_KEY, JSON.stringify({
      user_id: player.id,
      player_name: player.display_name || player.email || 'Jogador',
      email: player.email || '',
      character_id: character.id,
      character_name: character.name || 'Novo personagem',
      updated_at: character.updated_at || ''
    }));
    const url=new URL(location.href);
    url.search=''; url.searchParams.set('narratorView','1');
    location.href=url.toString();
  }

  async function pullPortraitFromCloudForUser(userId) {
    if(!supabaseClient || !userId || !navigator.onLine) return;
    const preview=document.getElementById('portraitPreview');
    const button=document.getElementById('portraitButton');
    if(preview){ preview.hidden=true; preview.src=''; }
    button?.classList.remove('has-portrait');
    try {
      const { data, error } = await supabaseClient.storage.from('portraits').download(`${userId}/portrait`);
      if(error) return;
      if(data) window.__chronusShowPortrait?.(data);
    } catch(e) { console.warn('CHRONUS: retrato do jogador indisponível',e); }
  }

  function applyNarratorReadOnly(meta) {
    narratorReadOnly=true; narratorViewMeta=meta;
    document.body.classList.remove('narrator-dashboard');
    document.body.classList.add('narrator-readonly');
    const panel=document.getElementById('narratorPanel'); if(panel) panel.hidden=true;
    const panelButton=document.getElementById('narratorPanelButton'); if(panelButton) panelButton.hidden=false;
    document.querySelectorAll('.workspace input,.workspace textarea,.workspace select,.workspace button').forEach(el=>{ el.disabled=true; el.setAttribute('aria-readonly','true'); });
    const banner=document.getElementById('narratorViewBanner');
    if(banner) banner.textContent=`Modo Narrador · ${meta?.player_name||'Jogador'} · somente leitura`;
    setSaveStatus('Somente leitura','cloud');
  }

  async function bootstrapNarrator(user, profile) {
    cloudUser=user; cloudCharacterId=null; cloudReady=false;
    updateAccountUi(user);
    hideAuthGate();
    const panelButton=document.getElementById('narratorPanelButton'); if(panelButton) panelButton.hidden=false;
    const params=new URLSearchParams(location.search);
    if(params.get('narratorView')==='1'){
      try { narratorViewMeta=JSON.parse(sessionStorage.getItem(NARRATOR_VIEW_META_KEY)||'null'); } catch { narratorViewMeta=null; }
      if(!narratorViewMeta?.user_id){
        location.href=location.pathname;
        return;
      }
      applyNarratorReadOnly(narratorViewMeta);
      await pullPortraitFromCloudForUser(narratorViewMeta.user_id);
      return;
    }
    await loadNarratorDashboard();
  }

  async function bootstrapRoleForUser(user) {
    if(!supabaseClient || !user) return;
    try {
      setSaveStatus('Verificando acesso…','saving');
      currentProfile=await getCurrentProfile(user);
      updateAccountUi(user);
      if(currentProfile?.role==='narrator') await bootstrapNarrator(user,currentProfile);
      else {
        clearNarratorModes();
        const panelButton=document.getElementById('narratorPanelButton'); if(panelButton) panelButton.hidden=true;
        await bootstrapCloudForUser(user);
      }
    } catch(e) {
      console.error('CHRONUS: não foi possível verificar o perfil',e);
      showAuthGate('Não foi possível verificar as permissões desta conta. '+(e?.message||''),true);
      setSaveStatus('Acesso indisponível','offline');
    }
  }

  function setupTabs() {
    const activate=(id, save=true)=>{
      document.querySelectorAll('.sheet-page').forEach(p=>p.classList.toggle('is-active',p.id===id));
      document.querySelectorAll('[data-page-target]').forEach(t=>t.classList.toggle('is-active',t.dataset.pageTarget===id));
      state.activePage=id; if(save) scheduleSave(); window.scrollTo({top:0,behavior:'smooth'});
    };
    document.querySelectorAll('[data-page-target]').forEach(t=>t.addEventListener('click',()=>activate(t.dataset.pageTarget,true)));
    activate(state.activePage||'page-1', false);
  }

  function setupActions() {
    document.getElementById('printButton').addEventListener('click',()=>window.print());
    document.getElementById('resetButton').addEventListener('click',async()=>{
      if(narratorReadOnly) return;
      if(cloudUser && !navigator.onLine){
        alert('Para limpar a ficha definitivamente da nuvem, conecte este dispositivo à internet e tente novamente.');
        return;
      }
      const who=currentProfile?.display_name ? ` de ${currentProfile.display_name}` : '';
      const typed=prompt(`ATENÇÃO: isto apagará todos os campos e o retrato da ficha${who}, inclusive a cópia na nuvem.\n\nDigite LIMPAR para confirmar:`);
      if(typed!=='LIMPAR') return;
      const fresh=clone(defaultState);
      if(currentProfile?.display_name) fresh.identity.player=currentProfile.display_name;
      Object.keys(state).forEach(k=>delete state[k]); Object.assign(state,fresh);
      persistLocalState(true);
      await clearPortrait(); localStorage.setItem(PORTRAIT_DIRTY_KEY,'1');
      if(cloudUser && cloudReady){
        await deletePortraitFromCloud();
        await pushStateToCloud();
      }
      alert('Ficha limpa com sucesso.');
      location.reload();
    });
  }
  function registerSW(){}

  
  async function initSheet() {
    applyDataBoxes();
    bindInputs();
    renderAttributes();
    renderResources();
    renderMana();
    renderWounds();
    renderList('skillsLayer', SKILL_Y, 'skills');
    renderList('advantagesLayer', ADV_Y, 'advantages');
    renderParadox();
    renderArcana();
    renderEquipment();
    renderFormulas();
    renderPage2();
    await setupPortrait();
    setupTabs();
    setupActions();
    registerSW();
  }



  // =========================================================================
  // INTEGRAÇÃO COM A ARQUITETURA DO PORTAL & STORAGE ESCOPADO
  // =========================================================================
  
  function getActiveUserId() {
    return cloudUser?.id || null;
  }

  function getScopedKey(keyType) {
    const uid = getActiveUserId();
    const cfg = window.CHRONUS_CONFIG;
    if (keyType === 'storage') return cfg.getStorageKey(uid);
    if (keyType === 'characterId') return cfg.getCharacterIdKey(uid);
    if (keyType === 'dirty') return cfg.getDirtyKey(uid);
    if (keyType === 'synced') return cfg.getSyncedKey(uid);
    if (keyType === 'portraitDirty') return cfg.getPortraitDirtyKey(uid);
    return cfg.LEGACY_STORAGE_KEY;
  }

  // Migração transparente de chaves legadas (chronus.sheet.v4) para escopo de usuário
  function migrateLegacyStorageForUser(userId) {
    if (!userId) return;
    const cfg = window.CHRONUS_CONFIG;
    const scopedKey = cfg.getStorageKey(userId);
    const legacyData = localStorage.getItem(cfg.LEGACY_STORAGE_KEY);
    const scopedData = localStorage.getItem(scopedKey);

    if (legacyData && !scopedData) {
      localStorage.setItem(scopedKey, legacyData);
      localStorage.setItem(cfg.getDirtyKey(userId), '0');
      console.log('CHRONUS: Migrado cache legado para escopo do usuário:', userId);
    }
  }

  // pushStateToCloud com retorno explícito de resultado { ok: true/false }
  async function pushStateToCloudConfirmed() {
    if (!supabaseClient || !cloudUser || !cloudCharacterId || !cloudReady) {
      return { ok: false, error: 'Engine da nuvem não inicializada ou usuário não logado' };
    }
    if (!navigator.onLine) {
      setSaveStatus('Offline • salvo local', 'offline');
      return { ok: false, error: 'Dispositivo offline' };
    }

    setSaveStatus('Sincronizando…', 'saving');
    try {
      const dirtyKey = getScopedKey('dirty');
      const syncedKey = getScopedKey('synced');

      const { data, error } = await supabaseClient
        .from('characters')
        .update({ name: cloudCharacterName(), data: clone(state) })
        .eq('id', cloudCharacterId)
        .eq('user_id', cloudUser.id)
        .select('updated_at')
        .single();

      if (error) throw error;

      localStorage.setItem(dirtyKey, '0');
      localStorage.setItem(syncedKey, data?.updated_at || new Date().toISOString());
      setSaveStatus('Salvo na nuvem ✓', 'cloud');
      return { ok: true, updated_at: data?.updated_at };
    } catch (e) {
      console.error('CHRONUS: Erro ao sincronizar ficha na nuvem:', e);
      const dirtyKey = getScopedKey('dirty');
      localStorage.setItem(dirtyKey, '1');
      setSaveStatus('Nuvem indisponível • salvo local', 'offline');
      return { ok: false, error: e.message || e };
    }
  }

  // Inicializar o DOM da ficha assim que carregado
  initSheet();

  // Conectar listener ao ChronusAuth (ÚNICA AUTORIDADE)
  if (window.ChronusAuth) {
    window.ChronusAuth.onAuthChange(async (user, profile) => {
      if (!supabaseClient && window.ChronusSupabase) {
        supabaseClient = window.ChronusSupabase.getClient();
      }
      if (user) {
        migrateLegacyStorageForUser(user.id);
        if (profile?.role === 'narrator') {
          await bootstrapNarrator(user, profile);
        } else {
          clearNarratorModes();
          await bootstrapCloudForUser(user);
        }
      } else {
        cloudUser = null;
        cloudCharacterId = null;
        cloudReady = false;
        currentProfile = null;
        narratorReadOnly = false;
        clearNarratorModes();
        updateAccountUi(null);
      }
    });
  }

  return {
    init: initSheet,
    applyNarratorViewMode: () => {
      try {
        const cfg = window.CHRONUS_CONFIG;
        const meta = JSON.parse(sessionStorage.getItem(cfg.NARRATOR_VIEW_META_KEY) || 'null');
        if (typeof applyNarratorReadOnly === 'function' && meta) {
          applyNarratorReadOnly(meta);
        }
      } catch (e) { console.error('Erro ao aplicar modo narrador na ficha:', e); }
    },
    applyPlayerViewMode: () => {
      try {
        if (typeof clearNarratorModes === 'function') clearNarratorModes();
      } catch (e) { console.error('Erro ao restaurar modo jogador na ficha:', e); }
    },
    pushStateToCloud: pushStateToCloudConfirmed,
    isDirty: () => {
      const dirtyKey = getScopedKey('dirty');
      return localStorage.getItem(dirtyKey) === '1';
    },
    getRollProfile,
    spendDetermination,
    dischargeParadox,
    getState: () => clone(state),
    loadState
  };
})();
