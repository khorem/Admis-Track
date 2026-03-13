// ---------- Default mock data ----------
const DEFAULT_EVENTS = [
  {
    id: "EVT-001",
    type: "Forum",
    title: "Forum Etudiants - Paris",
    date: "2026-03-03",
    city: "Paris",
    location: "Porte de Versailles",
    hours: "09:00 - 17:00",
    need: 4,
    contact: { name: "Mme Martin", email: "martin@ecole.fr", phone: "01 23 45 67 89" },
    description: "Accueil visiteurs, presentation formations, collecte contacts."
  },
  {
    id: "EVT-002",
    type: "Intervention",
    title: "Intervention Lycee - Creteil",
    date: "2026-03-19",
    city: "Creteil",
    location: "Lycee Jules Ferry",
    hours: "10:00 - 12:00",
    need: 2,
    contact: { name: "M. Diallo", email: "diallo@ecole.fr", phone: "01 98 76 54 32" },
    description: "Presentation ecole + echanges avec eleves."
  },
  {
    id: "EVT-003",
    type: "Evenement ecole",
    title: "JPO Campus - Lyon",
    date: "2026-04-05",
    city: "Lyon",
    location: "Campus Lyon",
    hours: "09:30 - 16:30",
    need: 6,
    contact: { name: "Service Admissions", email: "admissions@ecole.fr", phone: "04 11 22 33 44" },
    description: "Guidage, temoignage etudiant, orientation visiteurs."
  },
  {
    id: "EVT-004",
    type: "Salon",
    title: "Salon de l'Etudiant - Lille",
    date: "2026-04-18",
    city: "Lille",
    location: "Grand Palais",
    hours: "09:00 - 18:00",
    need: 5,
    contact: { name: "Mme Bernard", email: "bernard@ecole.fr", phone: "03 20 11 22 33" },
    description: "Salon : orientation, presentation ecole, collecte contacts."
  }
];

// ---------- Helpers ----------
function $(sel){ return document.querySelector(sel); }
function getParam(name){
  const u = new URL(window.location.href);
  return u.searchParams.get(name);
}
function go(url){ window.location.href = url; }

function loadJSON(key, fallback=null){
  try{ return JSON.parse(localStorage.getItem(key)) ?? fallback; }catch{ return fallback; }
}
function saveJSON(key, value){ localStorage.setItem(key, JSON.stringify(value)); }

// Dates
function todayISO(){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}
function isUnlockedByDate(eventDateISO){
  // unlocked starting the event day (>=)
  return todayISO() >= eventDateISO;
}

// Reset
function clearAll(){
  localStorage.removeItem("studentAuth");
  localStorage.removeItem("studentProfile");
  localStorage.removeItem("admin");
  localStorage.removeItem("participations");
  localStorage.removeItem("events");
  localStorage.removeItem("selectedEventId");
}

// ---------- Auth mock ----------
function studentRegister(profile){
  saveJSON("studentProfile", profile);
}
function studentLogin(email){
  saveJSON("studentAuth", { email });
}
function adminLogin(email){
  saveJSON("admin", { email, role:"Admissions" });
}

function requireStudent(){
  const auth = loadJSON("studentAuth", null);
  if(!auth) go("login-student.html");
  const profile = loadJSON("studentProfile", null);
  if(!profile || profile.email !== auth.email){
    go("student-register.html");
  }
  return { auth, profile };
}
function requireAdmin(){
  const a = loadJSON("admin", null);
  if(!a) go("login-admin.html");
  return a;
}

// ---------- Events (admin can create/edit - stored in localStorage) ----------
function getEvents(){
  const saved = loadJSON("events", null);
  return Array.isArray(saved) && saved.length ? saved : DEFAULT_EVENTS;
}
function setEvents(list){
  saveJSON("events", list);
}
function nextEventId(events){
  const nums = events
    .map(e => String(e.id || "").match(/EVT-(\d+)/))
    .filter(Boolean)
    .map(m => parseInt(m[1],10));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return "EVT-" + String(n).padStart(3,"0");
}
function findEvent(eventId){
  return getEvents().find(e=>e.id===eventId);
}

// ---------- Participations (multi) ----------
function getParticipations(){
  return loadJSON("participations", []);
}
function setParticipations(list){
  saveJSON("participations", list);
}
function getParticipationByEvent(eventId){
  const profile = loadJSON("studentProfile", null);
  const email = profile?.email || (loadJSON("studentAuth", {})||{}).email;
  return getParticipations().find(p=>p.event.id===eventId && p.student.email===email) || null;
}
function getParticipationById(id){
  return getParticipations().find(p=>p.id===id) || null;
}
function upsertParticipation(p){
  const list = getParticipations();
  const idx = list.findIndex(x=>x.id===p.id);
  if(idx>=0) list[idx]=p; else list.push(p);
  setParticipations(list);
}

// Participation = dossier (etudiant <-> evenement)
function startParticipation(eventId){
  const evt = findEvent(eventId);
  const profile = loadJSON("studentProfile", null);

  const p = {
    id: "PART-" + Math.random().toString(16).slice(2,8).toUpperCase(),
    status: "Brouillon", // Brouillon -> Soumis -> (Jour J) Complete
    createdAt: new Date().toISOString(),
    event: evt,
    student: {
      name: profile?.name || "Etudiant",
      email: profile?.email || "",
      phone: profile?.phone || "",
      formation: profile?.formation || "",
      campus: profile?.campus || "",
      year: profile?.year || "",
      address: profile?.address || ""
    },
    inscription: {
      available: "oui",
      roleWanted: profile?.defaultRole || "Participant",
      motivation: ""
    },
    presence: {
      present: "non",
      arrivedAt: "",
      leftAt: "",
      transport: profile?.defaultTransport || "Transports",
      departFrom: profile?.defaultDepartFrom || "",
      justificatifName: "",
      justificatifDataUrl: ""
    },
    defraiement: {
      type: "Transports",
      trajetA: "",
      trajetB: "",
      distanceKmAR: "",
      amountCalculated: "",
      lunchSalon: 0,
      justificatifName: "",
      justificatifDataUrl: "",
      status: "Non demande",
      adminMessage: ""
    },
    internal: {
      confirmedBySchool: "non",
      managedBy: "Admissions",
      internalComment: "",
      amountValidated: "",
      ccDonnes: "non"
    }
  };
  upsertParticipation(p);
  return p;
}

// ---------- UI helpers ----------
function badge(text, kind="pri"){
  return `<span class="badge ${kind}">${text}</span>`;
}
function groupBy(arr, key){
  return arr.reduce((acc, it)=>{
    const k = it[key] || "Autre";
    acc[k] = acc[k] || [];
    acc[k].push(it);
    return acc;
  }, {});
}

// ---------- Student: events list ----------
function renderEventsListGrouped(containerSel){
  const el = $(containerSel);
  if(!el) return;

  requireStudent();
  const events = getEvents().slice().sort((a,b)=> (a.date||"").localeCompare(b.date||""));
  const groups = groupBy(events, "type");

  el.innerHTML = Object.keys(groups).sort().map(type=>{
    const cards = groups[type].map(e=>{
      const p = getParticipationByEvent(e.id);
      const status = p ? p.status : "-";
      const role = p ? p.inscription.roleWanted : "-";
      const lock = isUnlockedByDate(e.date) ? "" : `<span class="badge warn">Debloque le ${e.date}</span>`;

      return `
        <div class="card">
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <div>
              <h2>${e.title}</h2>
              <div class="muted">${e.type} - ${e.city} - ${e.date} - ${e.hours}</div>
              <div class="small" style="margin-top:6px">${e.location}</div>
              <div class="row" style="margin-top:10px;gap:8px">
                ${p ? badge(`Statut: ${status}`,"pri") : badge("Pas encore inscrit","")}
                ${p ? badge(`Role: ${role}`,"") : ""}
                ${lock}
              </div>
            </div>
            <span class="badge pri">Besoin: ${e.need} etudiants</span>
          </div>
          <div class="hr"></div>
          <div class="row">
            <button class="btn primary" onclick="selectEvent('${e.id}')">${p ? "Modifier mon inscription" : "Voir et s'inscrire"}</button>
            <button class="btn ghost" onclick="previewEvent('${e.id}')">Details</button>
            ${p ? `<button class="btn success" onclick="go('student-presence.html?event=${encodeURIComponent(e.id)}')">Presence / Defraiement</button>` : ``}
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="card">
        <h2 style="margin-bottom:6px">${type}</h2>
        <div class="muted">Liste des evenements de type <b>${type}</b>.</div>
      </div>
      <div class="grid" style="margin-top:10px">${cards}</div>
    `;
  }).join(`<div style="height:10px"></div>`);
}

function selectEvent(eventId){
  localStorage.setItem("selectedEventId", eventId);
  const existing = getParticipationByEvent(eventId);
  if(existing){
    go(`student-inscription.html?event=${encodeURIComponent(eventId)}&part=${encodeURIComponent(existing.id)}`);
    return;
  }
  startParticipation(eventId);
  go(`student-inscription.html?event=${encodeURIComponent(eventId)}`);
}

function previewEvent(eventId){
  const e = findEvent(eventId);
  alert(`${e.title}\n\n${e.description}\n\nContact: ${e.contact.name} - ${e.contact.email}`);
}

// ---------- Admin render ----------
function renderAdminEventsTableGrouped(tbodySel){
  const tbody = $(tbodySel);
  if(!tbody) return;

  const events = getEvents().slice().sort((a,b)=> (a.date||"").localeCompare(b.date||""));
  const participations = getParticipations();

  const rows = events.map(e=>{
    const ps = participations.filter(p=>p.event.id===e.id);
    const confirmedCount = ps.filter(p=>p.internal.confirmedBySchool==="oui").length;
    const total = ps.length;

    return `
      <tr>
        <td>${e.id}</td>
        <td>${e.type}</td>
        <td>${e.title}</td>
        <td>${e.date}</td>
        <td>${e.city}</td>
        <td>${total? `<span class="badge pri">Dossiers: ${total}</span> ${confirmedCount?`<span class="badge ok">Confirmes: ${confirmedCount}</span>`:""}` : `<span class="badge">Aucun dossier</span>`}</td>
        <td>
          <a class="btn ghost" href="admin-event-form.html?mode=edit&event=${encodeURIComponent(e.id)}">Modifier</a>
          <a class="btn primary" href="admin-event-detail.html?event=${encodeURIComponent(e.id)}">Ouvrir</a>
        </td>
      </tr>
    `;
  }).join("");

  tbody.innerHTML = rows;
}

// Admin: list participations for an event
function renderAdminEventParticipations(containerSel, eventId){
  const el = $(containerSel);
  if(!el) return;

  const ps = getParticipations().filter(p=>p.event.id===eventId);
  if(!ps.length){
    el.innerHTML = `<div class="muted">Aucun dossier etudiant pour cet evenement (prototype).</div>`;
    return;
  }

  el.innerHTML = ps.map(p=>{
    const def = p.defraiement;
    const defBadge = def.status==="Accepte" ? "ok" : (def.status==="Refuse" ? "bad" : (def.status==="En attente" ? "warn" : ""));
    return `
      <div class="card" style="margin-bottom:12px">
        <div class="row" style="justify-content:space-between">
          <div>
            <div><b>${p.student.name}</b> (${p.student.email})</div>
            <div class="muted">${badge(`Statut: ${p.status}`,"pri")} ${badge(`Role: ${p.inscription.roleWanted}`,"")} ${badge(`Defraiement: ${def.status}`, defBadge)}</div>
          </div>
          <a class="btn primary" href="admin-dossier.html?part=${encodeURIComponent(p.id)}">Ouvrir la grande fiche</a>
        </div>
      </div>
    `;
  }).join("");
}

// ---------- File to dataURL (prototype) ----------
function fileToDataUrl(file, cb){
  if(!file){ cb({name:"", dataUrl:""}); return; }
  const reader = new FileReader();
  reader.onload = () => cb({ name:file.name, dataUrl: String(reader.result || "") });
  reader.readAsDataURL(file);
}
