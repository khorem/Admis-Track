// ---------- Default mock data ----------
const DEFAULT_EVENTS = [
  {
    id: "EVT-001",
    type: "Forum",
    title: "Forum etudiants - Paris",
    date: "2026-03-20",
    city: "Paris",
    location: "Porte de Versailles",
    startTime: "09:00",
    endTime: "17:00",
    hours: "09:00 - 17:00",
    need: 4,
    contact: { name: "Mme Martin", email: "martin@ecole.fr", phone: "01 23 45 67 89" },
    description: "Accueil visiteurs, presentation formations, collecte contacts."
  },
  {
    id: "EVT-002",
    type: "Intervention",
    title: "Intervention Lycee - Creteil",
    date: "2026-03-27",
    city: "Creteil",
    location: "Lycee Jules Ferry",
    startTime: "10:00",
    endTime: "12:00",
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
    startTime: "09:30",
    endTime: "16:30",
    hours: "09:30 - 16:30",
    need: 6,
    contact: { name: "Service Admissions", email: "admissions@ecole.fr", phone: "04 11 22 33 44" },
    description: "Guidage, temoignage etudiant, orientation visiteurs."
  },
  {
    id: "EVT-004",
    type: "Salon",
    title: "Salon de l'etudiant - Lille",
    date: "2026-04-18",
    city: "Lille",
    location: "Grand Palais",
    startTime: "09:00",
    endTime: "18:00",
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
  return todayISO() >= eventDateISO;
}
function canRegisterByDate(eventDateISO){
  // No registration on day J (strictly before event date only).
  return todayISO() < eventDateISO;
}

function formatEventHours(startTime, endTime, fallback=""){
  if(startTime && endTime) return `${startTime} - ${endTime}`;
  return fallback || "";
}

function normalizeEvent(e){
  const out = { ...e };
  const m = String(out.hours || "").match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/);
  if(!out.startTime && m) out.startTime = m[1];
  if(!out.endTime && m) out.endTime = m[2];
  out.hours = formatEventHours(out.startTime, out.endTime, out.hours);
  return out;
}

function isValidEmail(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}
function isValidPhone(phone){
  return /^(\+?\d[\d\s.-]{7,}\d)$/.test(String(phone || "").trim());
}

// Reset
function clearAll(){
  localStorage.removeItem("studentAuth");
  localStorage.removeItem("studentProfile");
  localStorage.removeItem("admin");
  localStorage.removeItem("participations");
  localStorage.removeItem("events");
  localStorage.removeItem("selectedEventId");
  localStorage.removeItem("adminNotifications");
}

// ---------- Admin notifications (prototype local) ----------
function getAdminNotifications(){
  return loadJSON("adminNotifications", []);
}
function pushAdminNotification(kind, message, meta={}){
  const list = getAdminNotifications();
  list.unshift({
    id: "NTF-" + Math.random().toString(16).slice(2,10).toUpperCase(),
    kind,
    message,
    meta,
    createdAt: new Date().toISOString()
  });
  saveJSON("adminNotifications", list.slice(0, 100));
}
function clearAdminNotifications(){
  saveJSON("adminNotifications", []);
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

// ---------- Events ----------
function getEvents(){
  const saved = loadJSON("events", null);
  const source = Array.isArray(saved) && saved.length ? saved : DEFAULT_EVENTS;
  return source.map(normalizeEvent);
}
function setEvents(list){
  saveJSON("events", (list || []).map(normalizeEvent));
}
function nextEventId(events){
  const nums = (events || [])
    .map(e => String(e.id || "").match(/EVT-(\d+)/))
    .filter(Boolean)
    .map(m => parseInt(m[1],10));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return "EVT-" + String(n).padStart(3,"0");
}
function findEvent(eventId){
  return getEvents().find(e=>e.id===eventId);
}
function deleteEvent(eventId){
  const events = getEvents();
  const target = events.find(e=>e.id===eventId);
  if(!target) return false;

  setEvents(events.filter(e=>e.id!==eventId));
  setParticipations(getParticipations().filter(p=>p.event.id!==eventId));

  if(localStorage.getItem("selectedEventId") === eventId){
    localStorage.removeItem("selectedEventId");
  }
  pushAdminNotification(
    "event_deleted",
    `Evenement supprime: ${target.title} (${target.id}).`,
    { eventId }
  );
  return true;
}

// ---------- Participations ----------
function getParticipations(){
  return loadJSON("participations", []);
}
function setParticipations(list){
  saveJSON("participations", list || []);
}
function isActiveParticipation(p){
  return p && p.status !== "Retire";
}
function getEventParticipations(eventId, opts={}){
  const activeOnly = !!opts.activeOnly;
  return getParticipations().filter(p=>{
    if(p.event.id !== eventId) return false;
    if(activeOnly && !isActiveParticipation(p)) return false;
    return true;
  });
}
function getParticipationByEvent(eventId){
  const profile = loadJSON("studentProfile", null);
  const email = profile?.email || (loadJSON("studentAuth", {})||{}).email;
  return getParticipations().find(p=>p.event.id===eventId && p.student.email===email && isActiveParticipation(p)) || null;
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
function removeParticipationById(partId){
  const p = getParticipationById(partId);
  if(!p) return false;
  setParticipations(getParticipations().filter(x=>x.id!==partId));
  pushAdminNotification(
    "participation_deleted",
    `Dossier supprime: ${p.student.name} - ${p.event.title} (${p.id}).`,
    { partId, eventId: p.event.id, studentEmail: p.student.email }
  );
  return true;
}
function getEventSubmittedCount(eventId){
  return getEventParticipations(eventId, { activeOnly: true })
    .filter(p=>p.status !== "Brouillon").length;
}
function getEventValidatedCount(eventId){
  return getEventParticipations(eventId, { activeOnly: true })
    .filter(p=>p.internal?.confirmedBySchool==="oui").length;
}
function getRegistrationClosedReason(event){
  if(!event) return "Evenement introuvable.";
  if(!canRegisterByDate(event.date)){
    return "Inscriptions fermees le jour J.";
  }
  const need = parseInt(event.need || "0", 10) || 0;
  if(need > 0 && getEventValidatedCount(event.id) >= need){
    return "Evenement complet (quota valide atteint).";
  }
  return "";
}
function getRemainingValidatedSlots(event){
  const need = parseInt(event.need || "0", 10) || 0;
  if(need <= 0) return 0;
  return Math.max(need - getEventValidatedCount(event.id), 0);
}

// Participation = dossier (etudiant <-> evenement)
function startParticipation(eventId){
  const evt = findEvent(eventId);
  const profile = loadJSON("studentProfile", null);

  const p = {
    id: "PART-" + Math.random().toString(16).slice(2,8).toUpperCase(),
    status: "Brouillon", // Brouillon -> Soumis -> ... / Retire
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
      justificatifDataUrl: "",
      justificatifOwnerEmail: ""
    },
    defraiement: {
      type: "Transports",
      trajetA: "",
      trajetB: "",
      distanceKmAR: "",
      amountCalculated: "",
      breakfastWanted: false, // visible only for Salon
      lunchSalon: 0,
      justificatifName: "",
      justificatifDataUrl: "",
      justificatifOwnerEmail: "",
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

function withdrawParticipation(eventId){
  const p = getParticipationByEvent(eventId);
  if(!p) return false;

  p.status = "Retire";
  p.internal.confirmedBySchool = "non";
  p.internal.internalComment = (p.internal.internalComment || "") + "\nRetrait etudiant: " + new Date().toISOString();
  upsertParticipation(p);

  pushAdminNotification(
    "student_withdraw",
    `${p.student.name} s'est desiste de ${p.event.title}.`,
    { partId: p.id, eventId: p.event.id, studentEmail: p.student.email }
  );
  return true;
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

function esc(text){
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function ensureEventModal(){
  let backdrop = document.querySelector("#eventModalBackdrop");
  if(backdrop) return backdrop;

  backdrop = document.createElement("div");
  backdrop.id = "eventModalBackdrop";
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="eventModalTitle">
      <div class="modal-head">
        <h2 id="eventModalTitle">Details de l'evenement</h2>
        <button class="btn ghost" type="button" onclick="closeEventModal()">Fermer</button>
      </div>
      <div class="modal-content" id="eventModalContent"></div>
    </div>
  `;

  backdrop.addEventListener("click", (ev)=>{
    if(ev.target === backdrop) closeEventModal();
  });
  document.addEventListener("keydown", (ev)=>{
    if(ev.key === "Escape"){
      closeEventModal();
    }
  });

  document.body.appendChild(backdrop);
  return backdrop;
}

function openEventModal(html){
  const backdrop = ensureEventModal();
  const content = document.querySelector("#eventModalContent");
  if(content) content.innerHTML = html;
  backdrop.classList.add("open");
  document.body.classList.add("modal-open");
}

function closeEventModal(){
  const backdrop = document.querySelector("#eventModalBackdrop");
  if(backdrop) backdrop.classList.remove("open");
  document.body.classList.remove("modal-open");
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
      const submittedCount = getEventSubmittedCount(e.id);
      const validatedCount = getEventValidatedCount(e.id);
      const remaining = getRemainingValidatedSlots(e);
      const lockReason = getRegistrationClosedReason(e);
      const canOpenSignup = p ? true : !lockReason;
      const lockBadge = lockReason ? `<span class="badge warn">${lockReason}</span>` : "";
      const disabledAttr = canOpenSignup ? "" : "disabled";

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
                ${badge(`Inscrits: ${submittedCount}`,"")}
                ${badge(`Valides: ${validatedCount}`,"")}
                ${badge(`Places restantes: ${remaining}`,"")}
                ${lockBadge}
              </div>
            </div>
            <span class="badge pri">Besoin: ${e.need} etudiants</span>
          </div>
          <div class="hr"></div>
          <div class="row">
            <button class="btn primary" ${disabledAttr} onclick="selectEvent('${e.id}')">${p ? "Modifier mon inscription" : "S'inscrire"}</button>
            <button class="btn ghost" onclick="previewEvent('${e.id}')">Details</button>
            ${p ? `<button class="btn success" onclick="go('student-presence.html?event=${encodeURIComponent(e.id)}')">Presence / Defraiement</button>` : ``}
            ${p ? `<button class="btn danger" onclick="desistFromEvent('${e.id}')">Se desister</button>` : ``}
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
  const event = findEvent(eventId);
  localStorage.setItem("selectedEventId", eventId);

  const existing = getParticipationByEvent(eventId);
  if(!existing){
    const lockReason = getRegistrationClosedReason(event);
    if(lockReason){
      alert(lockReason);
      return;
    }
  }

  if(existing){
    go(`student-inscription.html?event=${encodeURIComponent(eventId)}&part=${encodeURIComponent(existing.id)}`);
    return;
  }
  startParticipation(eventId);
  go(`student-inscription.html?event=${encodeURIComponent(eventId)}`);
}

function desistFromEvent(eventId){
  const p = getParticipationByEvent(eventId);
  if(!p) return;
  const ok = window.confirm("Confirmer votre desistement pour cet evenement ?");
  if(!ok) return;
  withdrawParticipation(eventId);
  alert("Desistement enregistre.");
  go("student-events.html");
}

function previewEvent(eventId){
  const e = findEvent(eventId);
  if(!e) return;
  const validated = getEventValidatedCount(e.id);
  const remaining = getRemainingValidatedSlots(e);
  const lockReason = getRegistrationClosedReason(e);

  openEventModal(`
    <div class="kv" style="margin-bottom:12px">
      <div>Titre</div><div><b>${esc(e.title)}</b></div>
      <div>Type</div><div>${esc(e.type)}</div>
      <div>Date</div><div>${esc(e.date)}</div>
      <div>Horaires</div><div>${esc(e.hours)}</div>
      <div>Ville / Lieu</div><div>${esc(e.city)} - ${esc(e.location)}</div>
      <div>Besoin</div><div>${esc(e.need)} etudiants</div>
      <div>Suivi</div><div>${badge(`Valides: ${validated} / ${e.need}`,"ok")} ${badge(`Places restantes: ${remaining}`,"pri")} ${lockReason ? badge(esc(lockReason),"warn") : badge("Inscriptions ouvertes","ok")}</div>
      <div>Contact</div><div>${esc(e.contact?.name || "-")} - ${esc(e.contact?.email || "-")} - ${esc(e.contact?.phone || "-")}</div>
      <div>Description</div><div>${esc(e.description || "-")}</div>
    </div>
    <div class="row">
      <button class="btn primary" type="button" onclick="closeEventModal()">Fermer</button>
    </div>
  `);
}

// ---------- Admin render ----------
function renderAdminTypeSummary(containerSel){
  const el = $(containerSel);
  if(!el) return;
  const events = getEvents();
  const groups = groupBy(events, "type");
  const html = Object.keys(groups).sort().map(type=>{
    const ids = groups[type].map(e=>e.id);
    const totalEvents = ids.length;
    const totalSubmitted = ids.reduce((acc,id)=>acc + getEventSubmittedCount(id), 0);
    const totalValidated = ids.reduce((acc,id)=>acc + getEventValidatedCount(id), 0);
    return `<span class="badge pri">${type}: ${totalEvents} evts / ${totalSubmitted} inscrits / ${totalValidated} valides</span>`;
  }).join(" ");
  el.innerHTML = html || `<span class="muted">Aucun type.</span>`;
}

function renderAdminNotifications(containerSel){
  const el = $(containerSel);
  if(!el) return;
  const list = getAdminNotifications();
  if(!list.length){
    el.innerHTML = `<div class="muted">Aucune notification.</div>`;
    return;
  }
  el.innerHTML = list.slice(0, 8).map(n=>{
    const when = new Date(n.createdAt).toLocaleString();
    return `<div class="small" style="margin-bottom:6px"><b>${when}</b> - ${n.message}</div>`;
  }).join("");
}

function renderAdminEventsTableGrouped(tbodySel){
  const tbody = $(tbodySel);
  if(!tbody) return;

  const events = getEvents().slice().sort((a,b)=> (a.date||"").localeCompare(b.date||""));
  const rows = events.map(e=>{
    const submitted = getEventSubmittedCount(e.id);
    const validated = getEventValidatedCount(e.id);
    const remaining = getRemainingValidatedSlots(e);
    const isLocked = getRegistrationClosedReason(e).includes("complet");

    return `
      <tr>
        <td>${e.id}</td>
        <td>${e.type}</td>
        <td>${e.title}</td>
        <td>${e.date}</td>
        <td>${e.city}</td>
        <td>
          <span class="badge pri">Inscrits: ${submitted}</span>
          <span class="badge ok">Valides: ${validated}</span>
          <span class="badge">Restants: ${remaining}</span>
          ${isLocked ? `<span class="badge warn">Complet</span>` : ``}
        </td>
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

  const ps = getEventParticipations(eventId, { activeOnly: true });
  if(!ps.length){
    el.innerHTML = `<div class="muted">Aucun dossier etudiant pour cet evenement.</div>`;
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
          <div class="row">
            <a class="btn primary" href="admin-dossier.html?part=${encodeURIComponent(p.id)}">Ouvrir la grande fiche</a>
            <button class="btn danger" onclick="removeStudentFromEvent('${p.id}')">Supprimer etudiant</button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function removeStudentFromEvent(partId){
  const p = getParticipationById(partId);
  if(!p) return;
  const ok = window.confirm(`Supprimer le dossier de ${p.student.name} pour ${p.event.title} ?`);
  if(!ok) return;
  removeParticipationById(partId);
  alert("Dossier supprime.");
  location.reload();
}

// ---------- File to dataURL ----------
function fileToDataUrl(file, cb){
  if(!file){ cb({name:"", dataUrl:""}); return; }
  const reader = new FileReader();
  reader.onload = () => cb({ name:file.name, dataUrl: String(reader.result || "") });
  reader.readAsDataURL(file);
}
