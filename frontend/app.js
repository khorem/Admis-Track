// ---------- Default fallback data ----------
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
    description: "Accueil visiteurs, presentation formations, collecte contacts.",
    submittedCount: 0,
    validatedCount: 0,
    remaining: 4,
    lockReason: ""
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

function todayISO(){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}
function isUnlockedByDate(eventDateISO){
  return todayISO() >= String(eventDateISO || "");
}
function canRegisterByDate(eventDateISO){
  return todayISO() < String(eventDateISO || "");
}
function formatEventHours(startTime, endTime, fallback=""){
  if(startTime && endTime) return `${startTime} - ${endTime}`;
  return fallback || "";
}
function isValidEmail(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}
function isValidPhone(phone){
  return /^(\+?\d[\d\s.-]{7,}\d)$/.test(String(phone || "").trim());
}
function normalizeEvent(e){
  const out = { ...(e || {}) };
  out.hours = formatEventHours(out.startTime, out.endTime, out.hours);
  out.submittedCount = Number(out.submittedCount || 0);
  out.validatedCount = Number(out.validatedCount || 0);
  out.remaining = Number(out.remaining || 0);
  out.lockReason = String(out.lockReason || "");
  return out;
}
function esc(text){
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function badge(text, kind="pri"){
  return `<span class="badge ${kind}">${text}</span>`;
}
function groupBy(arr, key){
  return (arr || []).reduce((acc, it)=>{
    const k = it?.[key] || "Autre";
    acc[k] = acc[k] || [];
    acc[k].push(it);
    return acc;
  }, {});
}

// ---------- Local storage keys ----------
const KEYS = {
  studentAuth: "studentAuth",
  studentSession: "studentSession",
  studentProfile: "studentProfile",
  admin: "admin",
  adminSession: "adminSession",
  events: "events",
  participations: "participations",
  adminNotifications: "adminNotifications",
  selectedEventId: "selectedEventId",
  apiBase: "apiBase"
};

const API_BASE = (localStorage.getItem(KEYS.apiBase) || "http://localhost:4000/api").replace(/\/+$/,"");

function clearStudentSession(keepEmail=true){
  if(!keepEmail){
    localStorage.removeItem(KEYS.studentAuth);
  }
  localStorage.removeItem(KEYS.studentSession);
  localStorage.removeItem(KEYS.studentProfile);
  localStorage.removeItem(KEYS.participations);
}
function clearAdminSession(){
  localStorage.removeItem(KEYS.admin);
  localStorage.removeItem(KEYS.adminSession);
  localStorage.removeItem(KEYS.adminNotifications);
}

// Reset all prototype data
function clearAll(){
  Object.values(KEYS).forEach((k)=> localStorage.removeItem(k));
}

// ---------- API ----------
function authTokenFor(type){
  if(type === "student"){
    return loadJSON(KEYS.studentSession, null)?.token || "";
  }
  if(type === "admin"){
    return loadJSON(KEYS.adminSession, null)?.token || "";
  }
  if(type === "auto"){
    return loadJSON(KEYS.adminSession, null)?.token
      || loadJSON(KEYS.studentSession, null)?.token
      || "";
  }
  return "";
}

async function apiRequest(path, opts={}){
  const method = opts.method || "GET";
  const auth = opts.auth || "none";
  const body = opts.body;

  const headers = { "Content-Type":"application/json" };
  const token = authTokenFor(auth);
  if(auth !== "none"){
    if(!token){
      throw new Error("Session expiree. Veuillez vous reconnecter.");
    }
    headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try{
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  }catch{
    throw new Error("Impossible de contacter l'API backend.");
  }

  let data = null;
  try{ data = await res.json(); }catch{ data = null; }

  if(!res.ok || !data?.ok){
    if(res.status === 401){
      if(auth === "student"){
        clearStudentSession(false);
      }
      if(auth === "admin"){
        clearAdminSession();
      }
    }
    throw new Error(data?.message || `Erreur API (${res.status}).`);
  }
  return data;
}

// ---------- Auth ----------
async function studentLogin(email){
  const cleanedEmail = String(email || "").trim().toLowerCase();
  const data = await apiRequest("/auth/student/login", {
    method:"POST",
    body:{ email: cleanedEmail }
  });

  saveJSON(KEYS.studentAuth, { email: cleanedEmail });
  if(data.exists){
    saveJSON(KEYS.studentSession, {
      token: data.token,
      email: data.user.email
    });
    saveJSON(KEYS.studentProfile, data.user);
  }else{
    clearStudentSession(true);
  }
  return data;
}

async function studentRegister(profile){
  const data = await apiRequest("/auth/student/register", {
    method:"POST",
    body: profile
  });
  saveJSON(KEYS.studentAuth, { email: data.user.email });
  saveJSON(KEYS.studentSession, {
    token: data.token,
    email: data.user.email
  });
  saveJSON(KEYS.studentProfile, data.user);
  return data;
}

async function adminLogin(email){
  const data = await apiRequest("/auth/admin/login", {
    method:"POST",
    body:{ email: String(email || "").trim().toLowerCase() }
  });
  saveJSON(KEYS.admin, {
    email: data.user.email,
    role: data.user.role === "ADMISSIONS" ? "Admissions" : data.user.role
  });
  saveJSON(KEYS.adminSession, {
    token: data.token,
    email: data.user.email,
    role: data.user.role
  });
  return data;
}

function requireStudent(){
  const auth = loadJSON(KEYS.studentAuth, null);
  if(!auth){
    go("login-student.html");
    return { auth:null, profile:null };
  }
  const session = loadJSON(KEYS.studentSession, null);
  if(!session){
    go("login-student.html");
    return { auth, profile:null };
  }
  const profile = loadJSON(KEYS.studentProfile, null);
  const profileComplete = !!(
    profile?.name &&
    profile?.email &&
    profile?.formation &&
    profile?.campus &&
    profile?.phone &&
    profile?.year
  );
  if(!profile || profile.email !== auth.email || !profileComplete){
    go("student-register.html");
    return { auth, profile:null };
  }
  return { auth, profile };
}

function requireAdmin(){
  const session = loadJSON(KEYS.adminSession, null);
  if(!session){
    go("login-admin.html");
    return { email:"", role:"" };
  }
  return loadJSON(KEYS.admin, {
    email: session.email,
    role: session.role === "ADMISSIONS" ? "Admissions" : session.role
  });
}

async function syncCurrentStudentProfile(){
  const data = await apiRequest("/students/me", { auth:"student" });
  saveJSON(KEYS.studentProfile, data.profile);
  return data.profile;
}

// ---------- Events cache ----------
function getEvents(){
  const saved = loadJSON(KEYS.events, null);
  const source = Array.isArray(saved) && saved.length ? saved : DEFAULT_EVENTS;
  return source.map(normalizeEvent);
}
function setEvents(list){
  saveJSON(KEYS.events, (list || []).map(normalizeEvent));
}
function findEvent(eventId){
  return getEvents().find((e)=> e.id === eventId) || null;
}
async function syncEvents(){
  const data = await apiRequest("/events");
  setEvents((data.events || []).map(normalizeEvent));
  return getEvents();
}
async function createEvent(data){
  const out = await apiRequest("/events", {
    method:"POST",
    auth:"admin",
    body:data
  });
  await syncEvents();
  return out.event;
}
async function updateEvent(eventId, data){
  const out = await apiRequest(`/events/${encodeURIComponent(eventId)}`, {
    method:"PUT",
    auth:"admin",
    body:data
  });
  await syncEvents();
  return out.event;
}
async function deleteEvent(eventId){
  await apiRequest(`/events/${encodeURIComponent(eventId)}`, {
    method:"DELETE",
    auth:"admin"
  });
  await syncEvents();
  const ps = getParticipations().filter((p)=>p.event.id !== eventId);
  setParticipations(ps);
  if(localStorage.getItem(KEYS.selectedEventId) === eventId){
    localStorage.removeItem(KEYS.selectedEventId);
  }
  return true;
}

// ---------- Participations cache ----------
function getParticipations(){
  return loadJSON(KEYS.participations, []);
}
function setParticipations(list){
  saveJSON(KEYS.participations, list || []);
}
function upsertParticipationLocal(p){
  const list = getParticipations();
  const idx = list.findIndex((x)=>x.id===p.id);
  if(idx>=0) list[idx] = p; else list.push(p);
  setParticipations(list);
}
function removeParticipationLocal(partId){
  setParticipations(getParticipations().filter((x)=>x.id!==partId));
}
function isActiveParticipation(p){
  return p && p.status !== "Retire";
}
function getParticipationByEvent(eventId){
  const profile = loadJSON(KEYS.studentProfile, null);
  const email = profile?.email || (loadJSON(KEYS.studentAuth, {})||{}).email;
  return getParticipations().find((p)=>p.event.id===eventId && p.student.email===email && isActiveParticipation(p)) || null;
}
function getParticipationById(id){
  return getParticipations().find((p)=>p.id===id) || null;
}
function getEventParticipations(eventId, opts={}){
  const activeOnly = !!opts.activeOnly;
  return getParticipations().filter((p)=>{
    if(p.event.id !== eventId) return false;
    if(activeOnly && !isActiveParticipation(p)) return false;
    return true;
  });
}

async function syncMyParticipations(){
  const data = await apiRequest("/students/me/participations", { auth:"student" });
  setParticipations(data.participations || []);
  return getParticipations();
}
async function syncEventParticipations(eventId, activeOnly=true){
  const data = await apiRequest(`/events/${encodeURIComponent(eventId)}/participations?activeOnly=${activeOnly ? "true":"false"}`, {
    auth:"admin"
  });
  setParticipations(data.participations || []);
  return data.participations || [];
}
async function refreshParticipationById(partId){
  const auth = loadJSON(KEYS.adminSession, null) ? "admin" : "student";
  const data = await apiRequest(`/participations/${encodeURIComponent(partId)}`, { auth });
  upsertParticipationLocal(data.participation);
  return data.participation;
}

async function startParticipation(eventId){
  const data = await apiRequest(`/participations/events/${encodeURIComponent(eventId)}`, {
    method:"POST",
    auth:"student"
  });
  upsertParticipationLocal(data.participation);
  return data.participation;
}
async function saveInscriptionStep(partId, payload){
  const data = await apiRequest(`/participations/${encodeURIComponent(partId)}/inscription`, {
    method:"PUT",
    auth:"student",
    body: payload
  });
  upsertParticipationLocal(data.participation);
  await syncEvents();
  return data.participation;
}
async function savePresenceStep(partId, payload){
  const data = await apiRequest(`/participations/${encodeURIComponent(partId)}/presence`, {
    method:"PUT",
    auth:"student",
    body: payload
  });
  upsertParticipationLocal(data.participation);
  return data.participation;
}
async function saveDefraiementStep(partId, payload){
  const data = await apiRequest(`/participations/${encodeURIComponent(partId)}/defraiement`, {
    method:"PUT",
    auth:"student",
    body: payload
  });
  upsertParticipationLocal(data.participation);
  return data.participation;
}
async function saveInternalStep(partId, payload){
  const data = await apiRequest(`/participations/${encodeURIComponent(partId)}/internal`, {
    method:"PUT",
    auth:"admin",
    body: payload
  });
  upsertParticipationLocal(data.participation);
  await syncEvents();
  return data.participation;
}
async function removeParticipationById(partId){
  await apiRequest(`/participations/${encodeURIComponent(partId)}`, {
    method:"DELETE",
    auth:"admin"
  });
  removeParticipationLocal(partId);
  await syncEvents();
  return true;
}
async function withdrawParticipation(eventId){
  let p = getParticipationByEvent(eventId);
  if(!p){
    await syncMyParticipations();
    p = getParticipationByEvent(eventId);
  }
  if(!p) return false;

  const data = await apiRequest(`/participations/${encodeURIComponent(p.id)}/withdraw`, {
    method:"POST",
    auth:"student"
  });
  upsertParticipationLocal(data.participation);
  await syncEvents();
  return true;
}

// ---------- Event state helpers ----------
function getEventSubmittedCount(eventId){
  const e = findEvent(eventId);
  if(e && typeof e.submittedCount === "number") return e.submittedCount;
  return getEventParticipations(eventId, { activeOnly:true }).filter((p)=>p.status !== "Brouillon").length;
}
function getEventValidatedCount(eventId){
  const e = findEvent(eventId);
  if(e && typeof e.validatedCount === "number") return e.validatedCount;
  return getEventParticipations(eventId, { activeOnly:true }).filter((p)=>p.internal?.confirmedBySchool==="oui").length;
}
function getRegistrationClosedReason(event){
  if(!event) return "Evenement introuvable.";
  if(event.lockReason) return String(event.lockReason);
  if(!canRegisterByDate(event.date)) return "Inscriptions fermees le jour J.";
  const need = parseInt(event.need || "0", 10) || 0;
  if(need > 0 && getEventValidatedCount(event.id) >= need){
    return "Evenement complet (quota valide atteint).";
  }
  return "";
}
function getRemainingValidatedSlots(event){
  if(event && typeof event.remaining === "number") return event.remaining;
  const need = parseInt(event?.need || "0", 10) || 0;
  if(need <= 0) return 0;
  return Math.max(need - getEventValidatedCount(event.id), 0);
}

// ---------- Notifications ----------
function getAdminNotifications(){
  return loadJSON(KEYS.adminNotifications, []);
}
function saveAdminNotifications(list){
  saveJSON(KEYS.adminNotifications, list || []);
}
async function syncAdminNotifications(){
  const data = await apiRequest("/notifications?limit=50", { auth:"admin" });
  saveAdminNotifications(data.notifications || []);
  return getAdminNotifications();
}
async function clearAdminNotifications(){
  await apiRequest("/notifications", {
    method:"DELETE",
    auth:"admin"
  });
  saveAdminNotifications([]);
}

// kept for compatibility (notifications are now server-driven)
function pushAdminNotification(_kind, _message, _meta={}){}

// ---------- Modal ----------
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
    if(ev.key === "Escape") closeEventModal();
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

// ---------- Student: events ----------
async function renderEventsListGrouped(containerSel){
  const el = $(containerSel);
  if(!el) return;

  try{
    requireStudent();
    await syncEvents();
    await syncMyParticipations();
  }catch(err){
    el.innerHTML = `<div class="card"><div class="muted">${esc(err.message || "Erreur de chargement.")}</div></div>`;
    return;
  }

  const events = getEvents().slice().sort((a,b)=> (a.date||"").localeCompare(b.date||""));
  const groups = groupBy(events, "type");

  el.innerHTML = Object.keys(groups).sort().map((type)=>{
    const cards = groups[type].map((e)=>{
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

async function selectEvent(eventId){
  try{
    localStorage.setItem(KEYS.selectedEventId, eventId);
    let event = findEvent(eventId);
    if(!event){
      await syncEvents();
      event = findEvent(eventId);
    }

    await syncMyParticipations();
    const existing = getParticipationByEvent(eventId);
    if(existing){
      go(`student-inscription.html?event=${encodeURIComponent(eventId)}&part=${encodeURIComponent(existing.id)}`);
      return;
    }

    const lockReason = getRegistrationClosedReason(event);
    if(lockReason){
      alert(lockReason);
      return;
    }

    const created = await startParticipation(eventId);
    go(`student-inscription.html?event=${encodeURIComponent(eventId)}&part=${encodeURIComponent(created.id)}`);
  }catch(err){
    alert(err.message || "Erreur lors de l'ouverture de l'inscription.");
  }
}

async function desistFromEvent(eventId){
  const p = getParticipationByEvent(eventId);
  if(!p) return;
  const ok = window.confirm("Confirmer votre desistement pour cet evenement ?");
  if(!ok) return;

  try{
    await withdrawParticipation(eventId);
    alert("Desistement enregistre.");
    go("student-events.html");
  }catch(err){
    alert(err.message || "Erreur lors du desistement.");
  }
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
async function renderAdminTypeSummary(containerSel){
  const el = $(containerSel);
  if(!el) return;
  try{
    const data = await apiRequest("/events/summary/types", { auth:"admin" });
    const html = (data.summary || []).map((x)=>
      `<span class="badge pri">${x.type}: ${x.totalEvents} evts / ${x.totalSubmitted} inscrits / ${x.totalValidated} valides</span>`
    ).join(" ");
    el.innerHTML = html || `<span class="muted">Aucun type.</span>`;
  }catch(err){
    el.innerHTML = `<span class="muted">${esc(err.message || "Erreur de chargement.")}</span>`;
  }
}

async function renderAdminNotifications(containerSel){
  const el = $(containerSel);
  if(!el) return;
  try{
    const list = await syncAdminNotifications();
    if(!list.length){
      el.innerHTML = `<div class="muted">Aucune notification.</div>`;
      return;
    }
    el.innerHTML = list.slice(0, 8).map((n)=>{
      const when = new Date(n.createdAt).toLocaleString();
      return `<div class="small" style="margin-bottom:6px"><b>${when}</b> - ${esc(n.message)}</div>`;
    }).join("");
  }catch(err){
    el.innerHTML = `<div class="muted">${esc(err.message || "Erreur de chargement.")}</div>`;
  }
}

async function renderAdminEventsTableGrouped(tbodySel){
  const tbody = $(tbodySel);
  if(!tbody) return;
  try{
    await syncEvents();
    const events = getEvents().slice().sort((a,b)=> (a.date||"").localeCompare(b.date||""));
    const rows = events.map((e)=>{
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
  }catch(err){
    tbody.innerHTML = `<tr><td colspan="7" class="muted">${esc(err.message || "Erreur de chargement.")}</td></tr>`;
  }
}

async function renderAdminEventParticipations(containerSel, eventId){
  const el = $(containerSel);
  if(!el) return;
  try{
    const ps = await syncEventParticipations(eventId, true);
    if(!ps.length){
      el.innerHTML = `<div class="muted">Aucun dossier etudiant pour cet evenement.</div>`;
      return;
    }
    el.innerHTML = ps.map((p)=>{
      const def = p.defraiement || {};
      const defBadge = def.status==="Accepte" ? "ok" : (def.status==="Refuse" ? "bad" : (def.status==="En attente" ? "warn" : ""));
      return `
        <div class="card" style="margin-bottom:12px">
          <div class="row" style="justify-content:space-between">
            <div>
              <div><b>${esc(p.student.name)}</b> (${esc(p.student.email)})</div>
              <div class="muted">${badge(`Statut: ${p.status}`,"pri")} ${badge(`Role: ${p.inscription.roleWanted}`,"")} ${badge(`Defraiement: ${def.status || "Non demande"}`, defBadge)}</div>
            </div>
            <div class="row">
              <a class="btn primary" href="admin-dossier.html?part=${encodeURIComponent(p.id)}">Ouvrir la grande fiche</a>
              <button class="btn danger" onclick="removeStudentFromEvent('${p.id}')">Supprimer etudiant</button>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }catch(err){
    el.innerHTML = `<div class="muted">${esc(err.message || "Erreur de chargement.")}</div>`;
  }
}

async function removeStudentFromEvent(partId){
  const p = getParticipationById(partId);
  if(!p) return;
  const ok = window.confirm(`Supprimer le dossier de ${p.student.name} pour ${p.event.title} ?`);
  if(!ok) return;

  try{
    await removeParticipationById(partId);
    alert("Dossier supprime.");
    location.reload();
  }catch(err){
    alert(err.message || "Erreur de suppression.");
  }
}

// ---------- File helpers ----------
function fileToDataUrl(file, cb){
  if(!file){ cb({name:"", dataUrl:""}); return; }
  const reader = new FileReader();
  reader.onload = () => cb({ name:file.name, dataUrl: String(reader.result || "") });
  reader.readAsDataURL(file);
}
function fileToDataUrlAsync(file){
  return new Promise((resolve)=> fileToDataUrl(file, resolve));
}
