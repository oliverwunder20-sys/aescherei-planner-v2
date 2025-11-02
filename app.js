/* Äscherei & Spalt – Planer v2.9 (Deutsch)
   – Wochenlogik (Fr→Mo), Kälber/Kühe-Regeln, Hauptweiche-Ende → ETA,
     Restlaufzeit-Timer, Warnampel, Daten-Editor, PWA
*/

const UI = {
  body: document.getElementById('planBody'),
  dialog: document.getElementById('eintragDialog'),
  dlgTitle: document.getElementById('dlgTitel'),
  override: document.getElementById('overrideDialog'),
  overrideText: document.getElementById('overrideText'),
  settings: document.getElementById('settingsDialog'),
  daten: document.getElementById('datenDialog'),

  modusBadge: document.getElementById('modusBadge'),

  f_start: document.getElementById('f_start'),
  f_sps: document.getElementById('f_sps'),
  f_fasstyp: document.getElementById('f_fasstyp'),
  f_rz: document.getElementById('f_rz'),
  f_switch: document.getElementById('f_switch'),
  f_gattung: document.getElementById('f_gattung'),
  f_gewicht: document.getElementById('f_gewicht'),
  f_menge: document.getElementById('f_menge'),
  f_konservierung: document.getElementById('f_konservierung'),
  f_waschen: document.getElementById('f_waschen'),
  f_hw_ende: document.getElementById('f_hauptweiche_ende'),
  f_status: document.getElementById('f_status'),
  f_notiz: document.getElementById('f_notiz'),

  tagInput: document.getElementById('tagInput'),
  schichtSelect: document.getElementById('schichtSelect'),
  spsFilter: document.getElementById('spsFilter'),
  btnHeute: document.getElementById('btnHeute'),
  btnNeu: document.getElementById('btnNeu'),
  btnExport: document.getElementById('btnExport'),
  btnImport: document.getElementById('btnImport'),
  btnEinstellungen: document.getElementById('btnEinstellungen'),
  btnWochen: document.getElementById('btnWochenansicht'),
  btnDaten: document.getElementById('btnDaten'),

  // Settings-Felder
  s_wash1: document.getElementById('s_wash1'),
  s_wash2: document.getElementById('s_wash2'),
  s_c: document.getElementById('s_c'),
  s_uc: document.getElementById('s_uc'),
  s_we_start: document.getElementById('s_we_start'),
  s_we_max: document.getElementById('s_we_max'),
  s_ae_std: document.getElementById('s_ae_std'),

  btnSettingsSave: document.getElementById('btnSettingsSave'),
  btnDatenSpeichern: document.getElementById('btnDatenSpeichern'),
  editGewicht: document.getElementById('editGewicht'),
  editLimits: document.getElementById('editLimits'),
  editRezepte: document.getElementById('editRezepte'),
};

const storeKey = "aescher-planer-v29";
const overridesKey = "aescher-overrides";
const settingsKey = "aescher-settings";
const dataLocalKey = "aescher-daten-local";

let DATEN = { rezepte:{}, gewichtsklassen:[], limits:{}, kapaz:{}, regeln:{} };
let PLAN = [];
let editIndex = -1;
let timerId = null;

// Zeit-Helfer
const toMin = t => t ? (t.split(':').map(Number)[0]*60 + t.split(':').map(Number)[1]) : null;
const minToTime = m => { m = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; };
function todayISO(){ return new Date().toISOString().slice(0,10); }

// Defaults
const DEFAULTS = {
  waschenMin1x: 60,
  waschenMin2x: 120,
  aescherdauerStd: 15,
  spsWaschAutomatik: s => s==='SPS 2' ? '2x' : '1x',
  kunde71SPS: 'SPS 1',
  kuhNurSPS2: true,
  kaelberNurSPS1: true,
  weFruehStart: '06:00',
  weMaxFaesser: 5
};

// Persistenz
function loadSettings(){ return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(settingsKey) || "{}")); }
let SETTINGS = loadSettings();
function saveSettings(){ localStorage.setItem(settingsKey, JSON.stringify(SETTINGS)); }
function loadOverrides(){ return JSON.parse(localStorage.getItem(overridesKey) || "{}"); }
function persistOverride(path, value){ const o = loadOverrides(); o[path]=value; localStorage.setItem(overridesKey, JSON.stringify(o)); }
function keyForDate(iso){ return storeKey + ":" + iso; }
function savePlan(dateISO){
  const key = keyForDate(dateISO || UI.tagInput.value || todayISO());
  localStorage.setItem(key, JSON.stringify(PLAN));
}
function loadPlan(dateISO){
  const key = keyForDate(dateISO || UI.tagInput.value || todayISO());
  PLAN = JSON.parse(localStorage.getItem(key) || "[]");
}

// Daten laden (mit Local-Override)
async function loadJSON(url, fallback){
  try{
    // Local override (Daten-Editor) hat Vorrang
    const localAll = JSON.parse(localStorage.getItem(dataLocalKey) || "{}");
    const keyName = url.split('/').pop();
    if (localAll[keyName]) return localAll[keyName];

    const r = await fetch(url, {cache:'no-store'});
    if(!r.ok) throw new Error(r.statusText);
    const data = await r.json();
    return (Array.isArray(data) && data.length===0) || (typeof data==='object' && data && Object.keys(data).length===0)
      ? fallback : data;
  }catch{ return fallback; }
}

// Fallbacks basierend auf deinem Input
const FALLBACK_REZEPTE = {
  "21":{"name":"RZ 21 – Frischware (Bullen außer Autoleder)","aescherdauerStd_h":15,"waschen":"auto"},
  "22":{"name":"RZ 22 – Frischware (Kühe)","aescherdauerStd_h":15,"waschen":"auto"},
  "23":{"name":"RZ 23 – Flanken (Äscher ≥13 h)","aescherdauerStd_h":15,"waschen":"auto"},
  "24":{"name":"RZ 24 – Frischware (Bullen außer Autoleder)","aescherdauerStd_h":15,"waschen":"auto"},
  "26":{"name":"RZ 26 – Salzware (außer Autoleder)","aescherdauerStd_h":23.5,"waschen":"auto"},
  "27":{"name":"RZ 27 – (Salz/Frisch je nach Plan)","aescherdauerStd_h":23.5,"waschen":"auto"},
  "28":{"name":"RZ 28 – (lang)","aescherdauerStd_h":23.5,"waschen":"auto"},
  "25":{"name":"RZ 25 – Schwarzbunte Bullen (Sep–Apr)","aescherdauerStd_h":15,"waschen":"auto"},
  "30":{"name":"RZ 30 – Kälber (EC Liming / unsplitted)","aescherdauerStd_h":26,"waschen":"auto"},
  "31":{"name":"RZ 31 – Kälber unsplitted (MW)","aescherdauerStd_h":27,"waschen":"auto"}
};
const FALLBACK_GEWICHT = [
  {"code":"15/+"},
  {"code":"17/24"},
  {"code":"25/29"},
  {"code":"30/39"},
  {"code":"40/49"},
  {"code":"50/59"},
  {"code":"60/+"},
  {"code":"60++"}
];
// Stückzahl-Limits (vereinfachtes, editierbares Raster)
const FALLBACK_LIMITS = {
  "Fass groß":{       // Zapfenfässer (normal)
    "Kühe":{"25/29":280,"30/39":240,"40/49":230,"50/59":150,"60/+":140,"60++":120},
    "Bullen":{"25/29":280,"30/39":250,"40/49":240,"50/59":170,"60/+":140,"60++":120},
    "Kälber":{"15/+":600,"17/24":600,"25/29":400}
  },
  "Paddel groß":{"Alle":{"default":600}},
  "Paddel klein":{"Alle":{"default":400}}
};
// Kapazitäten / Gewichte (für Ampel + Heuristik)
const FALLBACK_KAPAZ = {
  "Paddel groß":{"optimal_kg":13500,"max_kg":15000},
  "Paddel klein":{"optimal_kg":9000,"max_kg":9000},
  "Fass groß":{"optimal_kg":12000,"max_kg":12000}
};
// Regeln
const FALLBACK_REGELN = {
  "kunde_71_sps":"SPS 1",
  "kuehe_nur_sps2":true,
  "kaelber_nur_sps1":true,
  "sps1_waschen_standard":"1x",
  "sps2_waschen_standard":"2x",
  "we_frueh_start":"06:00",
  "we_max_faesser":5
};

(async function init(){
  UI.modusBadge.textContent = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "Mobil" : "Desktop";
  UI.tagInput.value = todayISO();

  DATEN.rezepte = await loadJSON('Daten/rezepte.json', FALLBACK_REZEPTE);
  DATEN.gewichtsklassen = await loadJSON('Daten/gewichtsklassen.json', FALLBACK_GEWICHT);
  DATEN.limits = await loadJSON('Daten/stueckzahl_limits.json', FALLBACK_LIMITS);
  DATEN.kapaz = FALLBACK_KAPAZ;
  DATEN.regeln = FALLBACK_REGELN;

  // Selects
  UI.f_rz.innerHTML = Object.keys(DATEN.rezepte).sort((a,b)=>a.localeCompare(b,'de',{numeric:true}))
    .map(k=>`<option value="${k}">${k}</option>`).join('');
  UI.f_gewicht.innerHTML = DATEN.gewichtsklassen.map(g=>`<option value="${g.code}">${g.code}</option>`).join('');

  // Settings laden
  UI.s_wash1.value = SETTINGS.waschenMin1x;
  UI.s_wash2.value = SETTINGS.waschenMin2x;
  UI.s_c.value = loadOverrides()['wechselMin']?.C ?? 10;
  UI.s_uc.value = loadOverrides()['wechselMin']?.UC ?? 5;
  UI.s_we_start.value = SETTINGS.weFruehStart;
  UI.s_we_max.value = SETTINGS.weMaxFaesser;
  UI.s_ae_std.value = SETTINGS.aescherdauerStd;

  // Daten-Editor füllen
  UI.editGewicht.value = JSON.stringify(DATEN.gewichtsklassen, null, 2);
  UI.editLimits.value = JSON.stringify(DATEN.limits, null, 2);
  UI.editRezepte.value = JSON.stringify(DATEN.rezepte, null, 2);

  // Events
  UI.btnHeute.onclick = ()=>{ UI.tagInput.value=todayISO(); loadPlan(); render(); };
  UI.spsFilter.onchange = render;
  UI.schichtSelect.onchange = render;
  UI.tagInput.onchange = ()=>{ loadPlan(); render(); };
  UI.btnNeu.onclick = openDialogNeu;
  UI.btnExport.onclick = exportJSON;
  UI.btnImport.onclick = importJSON;

  UI.btnEinstellungen.onclick = ()=> UI.settings.showModal();
  UI.btnSettingsSave.onclick = (e)=>{ e.preventDefault();
    SETTINGS.waschenMin1x = Number(UI.s_wash1.value);
    SETTINGS.waschenMin2x = Number(UI.s_wash2.value);
    SETTINGS.weFruehStart = UI.s_we_start.value || SETTINGS.weFruehStart;
    SETTINGS.weMaxFaesser = Number(UI.s_we_max.value)||SETTINGS.weMaxFaesser;
    SETTINGS.aescherdauerStd = Number(UI.s_ae_std.value)||SETTINGS.aescherdauerStd;
    saveSettings();
    const ov = loadOverrides();
    ov.wechselMin = { C:Number(UI.s_c.value)||10, UC:Number(UI.s_uc.value)||5 };
    localStorage.setItem(overridesKey, JSON.stringify(ov));
    UI.settings.close(); render();
  };

  UI.btnWochen.onclick = () => wochenAnsicht();
  UI.btnDaten.onclick = () => UI.daten.showModal();
  UI.btnDatenSpeichern.onclick = (e)=>{ e.preventDefault();
    try{
      const localData = {
        "gewichtsklassen.json": JSON.parse(UI.editGewicht.value),
        "stueckzahl_limits.json": JSON.parse(UI.editLimits.value),
        "rezepte.json": JSON.parse(UI.editRezepte.value)
      };
      localStorage.setItem(dataLocalKey, JSON.stringify(localData));
      alert("Daten gespeichert. Seite neu laden, damit alles aktiv ist.");
      UI.daten.close();
    }catch(err){ alert("Fehler in den JSON-Daten: " + err.message); }
  };

  loadPlan(); render(); startTimer();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
})();

// Timer für Restlaufzeit
function startTimer(){
  if (timerId) clearInterval(timerId);
  timerId = setInterval(()=>{ render(true); }, 60*1000);
}

// Anzeige-Helfer
function statusKlasse(s){
  return s==='läuft' ? 'st-laeuft' :
         s==='verschoben' ? 'st-verschoben' :
         s==='fertig' ? 'st-fertig' : 'st-geplant';
}
function zeigeStd(v){ return (v!=null) ? `${v.toFixed(1)} h` : '—'; }
function zeigeDauer(min){ return `${Math.floor(min/60)} h ${String(min%60).padStart(2,'0')} min`; }
function zeigeWaschen(w){
  return w==='auto' ? 'Automatik' :
         w==='1x' ? '1× (≈60 min)' :
         w==='2x' ? '2× (≈120 min)' :
         w==='0x' ? 'kein Waschen' : (w||'—');
}
function zeigeKonservierung(k){
  return k==='über_nacht' ? 'über Nacht (+24 h)' :
         k==='mehrtaegig_2' ? '2 Tage (+48 h)' :
         k==='mehrtaegig_3' ? '3 Tage (+72 h)' : 'keine';
}

// Rechnen
function wechselZeit(s){
  if (!s) return 0;
  const map = loadOverrides()['wechselMin'] ?? {C:10, UC:5};
  return Number(map[s] ?? 0);
}
function minWaschen(r){
  let w = r.waschen;
  if (w==='auto' || !w){
    w = (r.sps==='SPS 2' ? DATEN.regeln.sps2_waschen_standard : DATEN.regeln.sps1_waschen_standard);
  }
  if (w==='1x') return SETTINGS.waschenMin1x;
  if (w==='2x') return SETTINGS.waschenMin2x;
  return 0;
}
function aescherStd(r){
  const rz = DATEN.rezepte[r.rz];
  return rz?.aescherdauerStd_h ?? SETTINGS.aescherdauerStd;
}
function minKonservierung(r){
  return r.konservierung==='über_nacht' ? 1440 :
         r.konservierung==='mehrtaegig_2' ? 2880 :
         r.konservierung==='mehrtaegig_3' ? 4320 : 0;
}
// wenn Hauptweiche-Ende bekannt → wir rechnen ab dort
function startBasisMin(r){
  if (r.hwEnde) return toMin(r.hwEnde); // als Anker
  return toMin(r.start || SETTINGS.weFruehStart) || 0;
}
function berechneGesamtMin(r){
  const aeMin = Math.round(aescherStd(r)*60);
  return aeMin + minWaschen(r) + minKonservierung(r) + wechselZeit(r.switch);
}
function fertigMitTag(r){
  const ges = berechneGesamtMin(r);
  const start = startBasisMin(r);
  const total = start + ges;
  const tage = Math.floor(total / 1440);
  const time = minToTime(total);
  return { tage, time, label: tage ? `${time} (+${tage})` : time };
}
function restlaufzeit(r){
  const jetzt = new Date();
  const nowMin = jetzt.getHours()*60 + jetzt.getMinutes();
  if (r.status!=='läuft' || (!r.start && !r.hwEnde)) return null;
  const f = fertigMitTag(r);
  let endMin = toMin(f.time) + (f.tage*1440);
  let cur = nowMin;
  if (cur > endMin && f.tage===0){ endMin += 1440; } // über Mitternacht
  const rest = endMin - cur;
  return rest>0 ? rest : 0;
}
// Stückzahl-Auto
function autoStueck(r){
  const fasstyp = r.fasstyp || "Fass groß";
  const limits = DATEN.limits[fasstyp];
  if (!limits) return null;
  const gatt = r.gattung;
  const byGatt = limits[gatt] || limits["Alle"] || {};
  return byGatt[r.gewicht] ?? byGatt["default"] ?? null;
}
// Ampel nach kg (Kapaz)
function kgAmpel(r){
  if (!r.menge) return "";
  const k = DATEN.kapaz[r.fasstyp || "Fass groß"];
  if (!k) return "";
  if (r.menge > k.max_kg) return "err-row";
  if (r.menge > k.optimal_kg) return "warn-row";
  return "";
}

// Render
function render(fromTimer=false){
  const tbody = UI.body; tbody.innerHTML = '';
  const fSPS = UI.spsFilter.value;
  let rows = PLAN.map((r,i)=>({...r,index:i}));
  if (fSPS) rows = rows.filter(r=>r.sps===fSPS);

  // WE-Badge
  const d = new Date(UI.tagInput.value);
  const wd = d.getDay(); // 0 So … 6 Sa
  const isWE = (wd===0 || wd===6);
  UI.modusBadge.textContent = isWE ? "WE-Betrieb" : (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "Mobil" : "Desktop");

  rows.forEach(r=>{
    const tr = document.createElement('tr');

    const stAuto = autoStueck(r);
    const ampelKg = kgAmpel(r);
    const f = fertigMitTag(r);
    const gesMin = berechneGesamtMin(r);
    const rest = restlaufzeit(r);

    const extraClass = rest!=null ? 'info-row' : ampelKg;
    tr.className = extraClass;

    tr.innerHTML = `
      <td>${r.index+1}</td>
      <td>${r.start || (r.hwEnde ? 'HW Ende ' + r.hwEnde : '—')}</td>
      <td>${r.sps}</td>
      <td>${r.fasstyp || 'Fass groß'}</td>
      <td>${r.rz}</td>
      <td>${r.switch || '—'}</td>
      <td>${r.gattung}</td>
      <td>${r.gewicht || '—'}</td>
      <td>${r.menge ?? ''}</td>
      <td>${stAuto ?? '—'}</td>
      <td>${zeigeKonservierung(r.konservierung)}</td>
      <td>${zeigeWaschen(r.waschen)}</td>
      <td>${zeigeStd(aescherStd(r))}</td>
      <td>${zeigeDauer(gesMin)}</td>
      <td>${(r.start||r.hwEnde) ? f.label : '—'}</td>
      <td>${rest!=null ? zeigeDauer(rest) : '—'}</td>
      <td><span class="status-tag ${statusKlasse(r.status)}">${r.status}</span></td>
      <td>${r.notiz ?? ''}</td>
      <td>
        <button class="btn" onclick="editRow(${r.index})"><svg class="i"><use href="assets/suedleder-icons.svg#edit"/></svg></button>
        <button class="btn" onclick="delRow(${r.index})"><svg class="i"><use href="assets/suedleder-icons.svg#trash"/></svg></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Dialoge
function openDialogNeu(){
  editIndex = -1;
  UI.dlgTitle.textContent = "Neuer Eintrag";
  UI.f_start.value = "";
  UI.f_sps.value = "SPS 1";
  UI.f_fasstyp.value = "Fass groß";
  UI.f_rz.value = Object.keys(DATEN.rezepte)[0]||"21";
  UI.f_switch.value = "";
  UI.f_gattung.value = "Kühe";
  UI.f_gewicht.value = DATEN.gewichtsklassen[0]?.code || "";
  UI.f_menge.value = "";
  UI.f_konservierung.value = "keine";
  UI.f_waschen.value = "auto";
  UI.f_hw_ende.value = "";
  UI.f_status.value = "geplant";
  UI.f_notiz.value = "";
  UI.dialog.showModal();
}
window.editRow = function(idx){
  editIndex = idx;
  const r = PLAN[idx];
  UI.dlgTitle.textContent = `Eintrag bearbeiten #${idx+1}`;
  UI.f_start.value = r.start || "";
  UI.f_sps.value = r.sps;
  UI.f_fasstyp.value = r.fasstyp || "Fass groß";
  UI.f_rz.value = r.rz;
  UI.f_switch.value = r.switch || "";
  UI.f_gattung.value = r.gattung || "Kühe";
  UI.f_gewicht.value = r.gewicht || DATEN.gewichtsklassen[0]?.code || "";
  UI.f_menge.value = r.menge ?? "";
  UI.f_konservierung.value = r.konservierung || "keine";
  UI.f_waschen.value = r.waschen || "auto";
  UI.f_hw_ende.value = r.hwEnde || "";
  UI.f_status.value = r.status || "geplant";
  UI.f_notiz.value = r.notiz || "";
  UI.dialog.showModal();
}

document.getElementById('btnSpeichern').addEventListener('click', (ev)=>{
  ev.preventDefault();
  const row = {
    start: UI.f_start.value || null,
    sps: UI.f_sps.value,
    fasstyp: UI.f_fasstyp.value,
    rz: UI.f_rz.value,
    switch: UI.f_switch.value || null,
    gattung: UI.f_gattung.value,
    gewicht: UI.f_gewicht.value,
    menge: UI.f_menge.value ? Number(UI.f_menge.value) : null,
    konservierung: UI.f_konservierung.value,
    waschen: UI.f_waschen.value,
    hwEnde: UI.f_hw_ende.value || null,
    status: UI.f_status.value,
    notiz: UI.f_notiz.value || "",
    stueckManuell: null
  };

  const checks = [];

  // feste Regeln
  if (row.gattung==='Kühe' && SETTINGS.kuhNurSPS2 && row.sps!=='SPS 2'){
    checks.push("Regel: Kühe → bevorzugt SPS 2.");
  }
  if (row.gattung==='Kälber' && SETTINGS.kaelberNurSPS1 && row.sps!=='SPS 1'){
    checks.push("Regel: Kälber → ausschließlich SPS 1.");
  }

  // Wochenende
  const day = new Date(UI.tagInput.value).getDay();
  if (day===0 || day===6){
    if (row.start && toMin(row.start) < toMin(SETTINGS.weFruehStart)){
      checks.push(`Wochenende: Start frühestens ${SETTINGS.weFruehStart}.`);
    }
    const count = PLAN.length + (editIndex===-1 ? 1 : 0);
    if (count > SETTINGS.weMaxFaesser){
      checks.push(`Wochenende: Max. ${SETTINGS.weMaxFaesser} Fässer pro Tag.`);
    }
  }

  if (checks.length){
    overrideFlow(checks.join('\n'), ()=>commitRow(row));
  } else {
    commitRow(row);
  }
});

function commitRow(row){
  if (editIndex === -1) PLAN.push(row);
  else PLAN[editIndex] = row;
  UI.dialog.close();
  savePlan(); render();
}
function overrideFlow(text, onDone){
  UI.overrideText.textContent = text + "\nÜberschreiben?";
  UI.override.showModal();
  UI.override.addEventListener('close', ()=>{
    const v = UI.override.returnValue;
    if (v === 'persist'){ persistOverride("lastConfirm", Date.now()); }
    if (v === 'once' || v === 'persist') onDone();
  }, {once:true});
}
window.delRow = function(idx){
  PLAN.splice(idx,1);
  savePlan(); render();
};

// Import/Export
function exportJSON(){
  const blob = new Blob([JSON.stringify(PLAN,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'),{href:url,download:`plan_${UI.tagInput.value}.json`});
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function importJSON(){
  const inp = Object.assign(document.createElement('input'), {type:'file', accept:'application/json'});
  inp.onchange = async () => {
    try{ PLAN = JSON.parse(await inp.files[0].text()); savePlan(); render(); }
    catch{ alert("Ungültige JSON-Datei."); }
  };
  inp.click();
}

// Wochenansicht (Fr→Mo Hilfsinfo)
function wochenAnsicht(){
  const d = new Date(UI.tagInput.value);
  const day = d.getDay();
  const diffToFri = ((5 - day) + 7) % 7; // 5=Fr
  const fri = new Date(d); fri.setDate(d.getDate() - ((day+2)%7)); // einfacher: auf Mittwoch −2 → Mo −? (lassen)
  alert("Hinweis: Wochenansicht wird im nächsten Build als eigene Tabelle gezeigt. Heute: Tagesansicht nutzen. (Planung über Mitternacht wird bereits korrekt berechnet.)");
}
