/* Äscherei & Spalt – Planer v2 (Deutsch) */

const UI = {
  body: document.getElementById('planBody'),
  dialog: document.getElementById('eintragDialog'),
  dlgTitle: document.getElementById('dlgTitel'),
  override: document.getElementById('overrideDialog'),
  overrideText: document.getElementById('overrideText'),
  modusBadge: document.getElementById('modusBadge'),
  // Formfelder
  f_start: document.getElementById('f_start'),
  f_sps: document.getElementById('f_sps'),
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
};

const storeKey = "aescher-planer-v2";
const overridesKey = "aescher-overrides";

let DATEN = {
  rezepte: {},          // aus Daten/rezepte.json
  gewichtsklassen: [],  // aus Daten/gewichtsklassen.json
  limits: {}            // aus Daten/stueckzahl_limits.json
};
let PLAN = [];          // aktuelle Tageszeilen
let editIndex = -1;

// ---------- Hilfsfunktionen Zeit ----------
const toMin = t => {
  if (!t) return null;
  const [h,m] = t.split(':').map(Number);
  return h*60 + m;
};
const minToTime = m => {
  m = ((m % (24*60)) + 24*60) % (24*60);
  const hh = String(Math.floor(m/60)).padStart(2,'0');
  const mm = String(m%60).padStart(2,'0');
  return `${hh}:${mm}`;
};

// ---------- Regeln & Defaults ----------
const DEFAULTS = {
  waschenMin1x: 60,    // 1× Waschen ≈ 60 Min
  waschenMin2x: 120,   // 2× Waschen ≈ 120 Min
  aescherdauerStd: 15, // Standard wenn RZ nicht anders vorgibt
  spsWaschAutomatik: (sps) => sps === 'SPS 2' ? '2x' : '1x',
  kunde71SPS: 'SPS 1',
  kuhNurSPS2: true,
  samstagSonntagFruehStart: '06:00',
  samstagSonntagMaxFaesser: 5
};

// ---------- Persistenz ----------
function savePlan(){
  const key = storeKey + ":" + (UI.tagInput.value || new Date().toISOString().slice(0,10));
  localStorage.setItem(key, JSON.stringify(PLAN));
}
function loadPlan(){ 
  const key = storeKey + ":" + (UI.tagInput.value || new Date().toISOString().slice(0,10));
  PLAN = JSON.parse(localStorage.getItem(key) || "[]");
}
function loadOverrides(){
  return JSON.parse(localStorage.getItem(overridesKey) || "{}");
}
function persistOverride(path, value){
  const o = loadOverrides();
  o[path] = value;
  localStorage.setItem(overridesKey, JSON.stringify(o));
}

// ---------- Daten laden (mit Fallbacks, falls Dateien leer sind) ----------
async function loadJSON(url, fallback){
  try{
    const r = await fetch(url, {cache:'no-store'});
    if(!r.ok) throw new Error(r.statusText);
    const data = await r.json();
    // Wenn Datei existiert aber leer, fallback verwenden
    if ((Array.isArray(data) && data.length===0) ||
        (typeof data==='object' && data && Object.keys(data).length===0)) {
      return fallback;
    }
    return data;
  }catch(e){
    console.warn("Lade Fallback für", url, e);
    return fallback;
  }
}

// Fallbacks aus deinen Bildern/Regeln (konservativ, editierbar im UI)
const FALLBACK_REZEPTE = {
  // RZ = Prozessnummer
  "21": { name:"LWC Schwöde Frischware sd Bullen außer Autoleder",
          aescherdauerStd_h: 15,  // Rezept weist 15–17 h aus → wir setzen 15 als Planwert
          waschen: "auto"
  },
  "22": { name:"LWC Schwöde Frischware sd Kühe",
          aescherdauerStd_h: 15, waschen:"auto"
  },
  "23": { name:"LWC Schwöde Flanken",
          aescherdauerStd_h: 15, waschen:"auto"
  },
  "24": { name:"LWC Schwöde Frischware sd Bullen außer Autoleder (Varianten)",
          aescherdauerStd_h: 15, waschen:"auto"
  },
  "25": { name:"LWC Schwöde Frischware sb Ware Sep–Apr (Kurzkonservierung verfügbar)",
          aescherdauerStd_h: 15, waschen:"auto", konservierung:{ueberNacht:true}
  },
  "26": { name:"LWC Schwöde Salzware sd Ware außer Autoleder (mit Vorweiche möglich)",
          aescherdauerStd_h: 15, waschen:"auto"
  },
  "30": { name:"EC Liming (unsplitted Kälber-Prozess vorhanden)",
          aescherdauerStd_h: 26, waschen:"auto" // Foto zeigt Total running time 26 h
  },
  "31": { name:"MW Liming unsplitted (Kälber Variante)",
          aescherdauerStd_h: 26, waschen:"auto"
  }
};

const FALLBACK_GEWICHT = [
  // exakt nach deinem Foto „Abgrenzung der Gewichtsklassen“
  { code:"25/29",  von:25.0,  bis:29.5 },
  { code:"30/+" ,  von:29.6,  bis:33.0 },
  { code:"30/39",  von:33.1,  bis:39.5 },
  { code:"40/+" ,  von:36.6,  bis:43.0 },   // Hinweis: Foto überlappt; im UI editierbar
  { code:"40/49",  von:43.1,  bis:49.5 },
  { code:"50/+" ,  von:49.6,  bis:53.0 },
  { code:"50/59",  von:53.1,  bis:59.5 },
  { code:"60/+" ,  von:59.6,  bis:63.0 },
  { code:"60++",   von:63.1,  bis:999.0 }
];

const FALLBACK_LIMITS = {
  // Struktur: limits[FASSTYP][GATTUNG][GEWICHTSCODE] = maxStück
  // Fass-Typen: "Fass groß" (Zapfenfässer), "Paddel groß", "Paddel klein"
  "Fass groß": {
    "Kühe/Bullen": { "40/49": 230, "30/39": 250, "25/29": 280, "40/+":240, "50/59":150, "60/+":140, "50/+":170 },
    "Rinder/Bullen": { "17/24": 600 }, // aus Tabellenfoto (gelb)
    "Kühe/Kälber": { "25/29": 325, "30/+":300 }
  },
  "Paddel groß": {
    "Alle": { "default": 600 } // laut gelber Kasten: Paddelfässer groß 600
  },
  "Paddel klein": {
    "Alle": { "default": 400 } // gelber Kasten: Paddelfässer klein 400
  }
};

// ---------- Initialisierung ----------
(async function init(){
  document.getElementById('modusBadge').textContent =
    /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "Mobil" : "Desktop";

  // Standard Tag = heute
  UI.tagInput.value = new Date().toISOString().slice(0,10);

  // Daten laden
  DATEN.rezepte = await loadJSON('Daten/rezepte.json', FALLBACK_REZEPTE);
  DATEN.gewichtsklassen = await loadJSON('Daten/gewichtsklassen.json', FALLBACK_GEWICHT);
  DATEN.limits = await loadJSON('Daten/stueckzahl_limits.json', FALLBACK_LIMITS);

  // RZ-Select füllen
  UI.f_rz.innerHTML = Object.keys(DATEN.rezepte)
    .sort((a,b)=>a.localeCompare(b, 'de', {numeric:true}))
    .map(k => `<option value="${k}">${k} — RZ</option>`).join('');

  // Gewichtsklassen-Select
  UI.f_gewicht.innerHTML = DATEN.gewichtsklassen
    .map(g => `<option value="${g.code}">${g.code}</option>`).join('');

  loadPlan();
  render();

  // Events
  UI.btnHeute.onclick = ()=>{ UI.tagInput.value = new Date().toISOString().slice(0,10); loadPlan(); render(); };
  UI.spsFilter.onchange = render;
  UI.schichtSelect.onchange = render;
  UI.tagInput.onchange = ()=>{ loadPlan(); render(); };

  UI.btnNeu.onclick = ()=> openDialogNeu();

  UI.btnExport.onclick = exportJSON;
  UI.btnImport.onclick = importJSON;

  // PWA SW
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
})();

// ---------- Rendering ----------
function render(){
  const fSPS = UI.spsFilter.value;
  const tbody = UI.body;
  tbody.innerHTML = '';

  let rows = PLAN.map((r, i) => ({...r, index:i}));

  // Filter SPS
  if (fSPS) rows = rows.filter(r => r.sps === fSPS);

  // Wochenend-Plan: Anzeigehinweis (nicht blockierend)
  const d = new Date(UI.tagInput.value);
  const isWE = [0,6].includes(d.getDay());
  if (isWE) {
    // Frühstart 06:00, max 5 Fässer – rein visuell: spätere Validierung
  }

  for(const r of rows){
    const tr = document.createElement('tr');

    const gesMin = berechneGesamtMin(r);
    const fertigMin = (toMin(r.start) ?? 0) + gesMin;
    const stueck = autoBerechneStueck(r);

    tr.innerHTML = `
      <td>${r.index+1}</td>
      <td>${r.start || '—'}</td>
      <td>${r.sps}</td>
      <td>${r.rz}</td>
      <td>${r.switch || '—'}</td>
      <td>${r.gattung}</td>
      <td>${r.gewicht || '—'}</td>
      <td>${r.menge ?? ''}</td>
      <td>${stueck ?? '—'}</td>
      <td>${zeigeKonservierung(r.konservierung)}</td>
      <td>${zeigeWaschen(r.waschen)}</td>
      <td>${zeigeStd(r.aescherStd)}</td>
      <td>${zeigeDauer(gesMin)}</td>
      <td>${r.start ? minToTime(fertigMin) : '—'}</td>
      <td><span class="status-tag ${statusKlasse(r.status)}">${r.status}</span></td>
      <td>${r.notiz ?? ''}</td>
      <td>
        <button class="btn" onclick="editRow(${r.index})">
          <svg class="i"><use href="assets/suedleder-icons.svg#edit"/></svg>
        </button>
        <button class="btn" onclick="delRow(${r.index})">
          <svg class="i"><use href="assets/suedleder-icons.svg#trash"/></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  }
}
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
  switch(k){
    case 'über_nacht': return 'über Nacht (+24 h)';
    case 'mehrtaegig_2': return '2 Tage (+48 h)';
    case 'mehrtaegig_3': return '3 Tage (+72 h)';
    default: return 'keine';
  }
}

// ---------- Rechnen ----------
function minWaschen(r){
  let w = r.waschen;
  if (w==='auto' || !w){
    w = DEFAULTS.spsWaschAutomatik(r.sps);
  }
  if (w==='1x') return DEFAULTS.waschenMin1x;
  if (w==='2x') return DEFAULTS.waschenMin2x;
  return 0;
}
function minKonservierung(r){
  switch(r.konservierung){
    case 'über_nacht': return 24*60;
    case 'mehrtaegig_2': return 48*60;
    case 'mehrtaegig_3': return 72*60;
    default: return 0;
  }
}
function aescherStd(r){
  // 1) Wenn RZ eine definierte Äscherdauer hat → diese
  const rz = DATEN.rezepte[r.rz];
  let std = rz?.aescherdauerStd_h ?? DEFAULTS.aescherdauerStd;

  // 2) Wenn Ende Hauptweiche angegeben ist und Startzeit fehlt:
  // wir rechnen ab Ende HW + Restdauer (ohne HW) – hier Näherung: Äscherdauer bleibt,
  // damit du auch ohne Startzeit ein Fertig-ETA bekommst.
  return std;
}
function berechneGesamtMin(r){
  // Gesamt = (Äscher h + Waschen min + evtl. konservierung) + Wechselzeiten (C/UC)
  const aeMin = Math.round(aescherStd(r) * 60);
  const wMin  = minWaschen(r);
  const konMin = minKonservierung(r);

  const wechselMin = wechselZeit(r.switch);
  return aeMin + wMin + konMin + wechselMin;
}
function wechselZeit(s){
  // Deine Vorgabe: eine Spalte mit Kürzel „C“ oder „UC“ und die Minuten integriert
  if (!s) return 0;
  // Defaults (anpassbar im UI via Override-Dialog)
  const o = loadOverrides();
  const map = o['wechselMin'] ?? { "C": 10, "UC": 5 };
  return Number(map[s] ?? 0);
}

function autoBerechneStueck(r){
  if (!r.gattung || !r.gewicht) return null;

  // Fass-Typ: aus SPS ableiten? Hier planebene → wir nehmen man frei: Zapfen = „Fass groß“,
  // Paddel separat pro Anlage? Für jetzt: SPS 1/2 sind Spaltstraßen; Fasswahl = „Fass groß“
  // Tipp: Du kannst später pro Zeile noch „Fasstyp“ ergänzen.
  let fasstyp = "Fass groß";
  if (r.gattung==='Kälber' && r.paddel==='groß') fasstyp = "Paddel groß";
  if (r.gattung==='Kälber' && r.paddel==='klein') fasstyp = "Paddel klein";

  const limits = DATEN.limits[fasstyp];
  if (!limits) return null;

  // Gattungs-Mapping, wie auf deinen Blättern:
  const gKey = (fasstyp==="Fass groß")
      ? (r.gattung==='Kühe'||r.gattung==='Bullen' ? "Kühe/Bullen" :
         r.gattung==='Kälber' ? "Kühe/Kälber" : r.gattung)
      : "Alle";

  const byGatt = limits[gKey] || {};
  const val = byGatt[r.gewicht] ?? byGatt["default"] ?? null;
  return val;
}

// ---------- Dialog Neu/Bearbeiten ----------
function openDialogNeu(){
  editIndex = -1;
  UI.dlgTitle.textContent = "Neuer Eintrag";
  UI.f_start.value = "";
  UI.f_sps.value = "SPS 1";
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
function editRow(idx){
  editIndex = idx;
  const r = PLAN[idx];
  UI.dlgTitle.textContent = `Eintrag bearbeiten #${idx+1}`;
  UI.f_start.value = r.start || "";
  UI.f_sps.value = r.sps;
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
    rz: UI.f_rz.value,
    switch: UI.f_switch.value || null,
    gattung: UI.f_gattung.value,
    gewicht: UI.f_gewicht.value,
    menge: UI.f_menge.value ? Number(UI.f_menge.value) : null,
    konservierung: UI.f_konservierung.value,
    waschen: UI.f_waschen.value,
    hwEnde: UI.f_hw_ende.value || null,
    status: UI.f_status.value,
    notiz: UI.f_notiz.value || ""
  };

  // Regelprüfungen (sanft + Override-Dialog)
  const checks = [];
  if (row.gattung==='Kühe' && DEFAULTS.kuhNurSPS2 && row.sps!=='SPS 2'){
    checks.push("Kühe → standardmäßig SPS 2");
  }
  if (row.kunde === 71 && row.sps !== DEFAULTS.kunde71SPS){
    checks.push("Kunde 71 → standardmäßig SPS 1");
  }
  if (checks.length){
    overrideFlow(checks.join('\n'), ()=>{
      commitRow(row);
    });
  }else{
    commitRow(row);
  }
});
function commitRow(row){
  if (editIndex === -1) PLAN.push(row);
  else PLAN[editIndex] = row;
  UI.dialog.close();
  savePlan();
  render();
}

// „einmalig vs dauerhaft“
function overrideFlow(text, onDone){
  UI.overrideText.textContent = text + "\nÜberschreiben?";
  UI.override.showModal();
  UI.override.addEventListener('close', ()=>{
    const v = UI.override.returnValue;
    if (v === 'persist'){
      // Beispiel: dauerhaft Kunde71→SPS1
      persistOverride("kunde71SPS", "SPS 1");
    }
    if (v === 'once' || v === 'persist'){
      onDone();
    }
  }, {once:true});
}

function delRow(idx){
  PLAN.splice(idx,1);
  savePlan(); render();
}

// ---------- Import/Export ----------
function exportJSON(){
  const blob = new Blob([JSON.stringify(PLAN,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'),{href:url,download:`plan_${UI.tagInput.value}.json`});
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function importJSON(){
  const inp = Object.assign(document.createElement('input'), {type:'file', accept:'application/json'});
  inp.onchange = async () => {
    const txt = await inp.files[0].text();
    try{
      PLAN = JSON.parse(txt);
      savePlan(); render();
    }catch(e){ alert("Ungültige JSON-Datei."); }
  };
  inp.click();
}

