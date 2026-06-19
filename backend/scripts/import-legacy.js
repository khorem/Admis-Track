require("dotenv").config();

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function toHHmm(value) {
  if (!value) return "";
  const raw = String(value);
  const match = raw.match(/^(\d{2}:\d{2})/);
  return match ? match[1] : "";
}

function asDateOnlyISO(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function buildPersonName(prenom, nom) {
  return String(`${prenom || ""} ${nom || ""}`).trim() || String(nom || "").trim() || "Etudiant";
}

function mapLegacyRole(typeLibelle) {
  return String(typeLibelle || "").toLowerCase() === "staff_admission" ? "ADMISSIONS" : "STUDENT";
}

function mapLegacyTransport(modeArrivee) {
  const v = String(modeArrivee || "").toLowerCase().trim();
  if (v.includes("voiture")) return "Voiture";
  if (v.includes("covoit")) return "Covoiturage";
  return "Transports";
}

function eventCodeFromLegacyId(idEvenement) {
  return `EVT-${String(idEvenement).padStart(3, "0")}`;
}

function partCodeFromLegacyIds(idPersonne, idEvenement) {
  return `PART-LG-${idPersonne}-${idEvenement}`;
}

async function ensureLegacyTablesPresent() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name IN (
        'personne','type_utilisateur','evenement','type_evenement',
        'etablissement','contact','participer','journalisation','liste_ambassadeur'
      );
  `);

  const names = new Set(rows.map((r) => String(r.table_name || r.TABLE_NAME || "").toLowerCase()));
  const must = [
    "personne",
    "type_utilisateur",
    "evenement",
    "type_evenement",
    "etablissement",
    "participer"
  ];
  const missing = must.filter((n) => !names.has(n));
  return { missing };
}

async function importUsers() {
  const legacyUsers = await prisma.$queryRawUnsafe(`
    SELECT
      p.id,
      p.nom,
      p.prenom,
      p.email,
      p.telephone,
      p.programme,
      tu.libelle AS type_libelle
    FROM personne p
    LEFT JOIN type_utilisateur tu ON tu.id = p.id_type_utilisateur
    ORDER BY p.id ASC
  `);

  const userByLegacyId = new Map();
  let created = 0;
  let updated = 0;

  for (const row of legacyUsers) {
    const email = String(row.email || "").trim().toLowerCase() || `legacy-user-${row.id}@local.invalid`;
    const role = mapLegacyRole(row.type_libelle);
    const name = buildPersonName(row.prenom, row.nom);
    const formation = String(row.programme || "").trim();
    const phone = String(row.telephone || "").trim();

    const exists = await prisma.user.findUnique({ where: { email } });
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        role,
        name,
        formation: formation || exists?.formation || "",
        phone: phone || exists?.phone || ""
      },
      create: {
        email,
        role,
        name,
        formation: formation || null,
        phone: phone || null
      }
    });

    if (exists) updated += 1;
    else created += 1;
    userByLegacyId.set(Number(row.id), user.id);
  }

  return {
    userByLegacyId,
    stats: { created, updated, total: legacyUsers.length }
  };
}

async function importEvents() {
  const contacts = await prisma.$queryRawUnsafe(`
    SELECT
      id_etablissement,
      id,
      nom,
      prenom,
      email,
      telephone
    FROM contact
    ORDER BY id ASC
  `);

  const firstContactByEtab = new Map();
  for (const c of contacts) {
    const key = Number(c.id_etablissement || 0);
    if (!key || firstContactByEtab.has(key)) continue;
    firstContactByEtab.set(key, c);
  }

  const legacyEvents = await prisma.$queryRawUnsafe(`
    SELECT
      e.id,
      e.titre,
      e.description,
      e.date_debut,
      e.heure_debut,
      e.heure_fin,
      e.objectif_fiches,
      e.id_etablissement,
      te.libelle AS type_libelle,
      et.nom AS etab_nom,
      et.adresse AS etab_adresse,
      et.ville AS etab_ville
    FROM evenement e
    LEFT JOIN type_evenement te ON te.id = e.id_type_evenement
    LEFT JOIN etablissement et ON et.id = e.id_etablissement
    ORDER BY e.id ASC
  `);

  const eventByLegacyId = new Map();
  let created = 0;
  let updated = 0;

  for (const row of legacyEvents) {
    const code = eventCodeFromLegacyId(row.id);
    const type = String(row.type_libelle || "Autre").trim() || "Autre";
    const title = String(row.titre || "").trim() || `Evenement ${row.id}`;
    const dateIso = asDateOnlyISO(row.date_debut) || "2026-01-01";
    const city = String(row.etab_ville || "").trim() || "N/A";
    const location = String(row.etab_nom || row.etab_adresse || "").trim() || "N/A";
    const startTime = toHHmm(row.heure_debut) || "09:00";
    const endTime = toHHmm(row.heure_fin) || "17:00";
    const needRaw = Number(row.objectif_fiches || 0);
    const need = Number.isFinite(needRaw) && needRaw > 0 ? Math.round(needRaw) : 1;

    const contact = firstContactByEtab.get(Number(row.id_etablissement || 0));
    const contactName = contact ? buildPersonName(contact.prenom, contact.nom) : "";
    const contactEmail = contact ? String(contact.email || "").trim() : "";
    const contactPhone = contact ? String(contact.telephone || "").trim() : "";

    const exists = await prisma.event.findUnique({ where: { code } });
    const event = await prisma.event.upsert({
      where: { code },
      update: {
        type,
        title,
        date: new Date(`${dateIso}T00:00:00.000Z`),
        city,
        location,
        startTime,
        endTime,
        hours: `${startTime} - ${endTime}`,
        need,
        contactName: contactName || null,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        description: String(row.description || "").trim() || null
      },
      create: {
        code,
        type,
        title,
        date: new Date(`${dateIso}T00:00:00.000Z`),
        city,
        location,
        startTime,
        endTime,
        hours: `${startTime} - ${endTime}`,
        need,
        contactName: contactName || null,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        description: String(row.description || "").trim() || null
      }
    });

    if (exists) updated += 1;
    else created += 1;
    eventByLegacyId.set(Number(row.id), event.id);
  }

  return {
    eventByLegacyId,
    stats: { created, updated, total: legacyEvents.length }
  };
}

async function importParticipations(userByLegacyId, eventByLegacyId) {
  const legacy = await prisma.$queryRawUnsafe(`
    SELECT
      id_personne,
      id_evenement,
      mode_arrivee,
      commentaires,
      fiches_collectees
    FROM participer
  `);

  let created = 0;
  let skipped = 0;

  for (const row of legacy) {
    const studentId = userByLegacyId.get(Number(row.id_personne));
    const eventId = eventByLegacyId.get(Number(row.id_evenement));

    if (!studentId || !eventId) {
      skipped += 1;
      continue;
    }

    const code = partCodeFromLegacyIds(row.id_personne, row.id_evenement);
    const existing = await prisma.participation.findUnique({
      where: {
        studentId_eventId: { studentId, eventId }
      }
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.participation.create({
      data: {
        code,
        status: "Soumis",
        studentId,
        eventId,
        inscription: {
          create: {
            available: "oui",
            roleWanted: "Participant",
            motivation: String(row.commentaires || "").trim() || ""
          }
        },
        presence: {
          create: {
            present: "non",
            transport: mapLegacyTransport(row.mode_arrivee),
            departFrom: "",
            arrivedAt: "",
            leftAt: "",
            justificatifName: "",
            justificatifDataUrl: "",
            justificatifOwnerEmail: ""
          }
        },
        defraiement: {
          create: {
            type: "Transports",
            trajetA: "",
            trajetB: "",
            distanceKmAR: null,
            amountCalculated: null,
            breakfastWanted: false,
            lunchSalon: 0,
            justificatifName: "",
            justificatifDataUrl: "",
            justificatifOwnerEmail: "",
            status: "Non demande",
            adminMessage: ""
          }
        },
        internalReview: {
          create: {
            confirmedBySchool: "non",
            managedBy: "Admissions",
            internalComment: String(row.commentaires || "").trim() || "",
            amountValidated: null,
            ccDonnes: "non"
          }
        }
      }
    });
    created += 1;
  }

  return { created, skipped, total: legacy.length };
}

async function importJournalisation(eventByLegacyId) {
  const legacy = await prisma.$queryRawUnsafe(`
    SELECT id, id_evenement, action, date_action
    FROM journalisation
    ORDER BY id ASC
  `);

  let created = 0;
  let skipped = 0;

  for (const row of legacy) {
    const code = `NTF-JRN-${row.id}`;
    const exists = await prisma.notification.findUnique({ where: { code } });
    if (exists) {
      skipped += 1;
      continue;
    }

    const eventId = eventByLegacyId.get(Number(row.id_evenement));
    const event = eventId ? await prisma.event.findUnique({ where: { id: eventId } }) : null;

    await prisma.notification.create({
      data: {
        code,
        kind: "legacy_journal",
        message: String(row.action || "").trim() || "Journal legacy",
        meta: event ? { legacyEventId: row.id_evenement, eventCode: event.code } : { legacyEventId: row.id_evenement || null },
        createdAt: row.date_action ? new Date(row.date_action) : new Date()
      }
    });
    created += 1;
  }

  return { created, skipped, total: legacy.length };
}

async function importAmbassadors(userByLegacyId) {
  const legacy = await prisma.$queryRawUnsafe(`
    SELECT id_personne, points, statut
    FROM liste_ambassadeur
  `);

  let updated = 0;

  for (const row of legacy) {
    const userId = userByLegacyId.get(Number(row.id_personne));
    if (!userId) continue;

    const statut = String(row.statut || "").toLowerCase();
    if (statut && statut !== "actif") continue;

    await prisma.user.update({
      where: { id: userId },
      data: {
        defaultRoleWanted: "Ambassadeur"
      }
    });
    updated += 1;
  }

  return { updated, total: legacy.length };
}

async function main() {
  const presence = await ensureLegacyTablesPresent();
  if (presence.missing.length) {
    throw new Error(
      `Legacy tables not found in current DATABASE_URL: ${presence.missing.join(", ")}.\n` +
      "Import your SQL dumps first (schema + data), then rerun npm run import:legacy."
    );
  }

  const userResult = await importUsers();
  const eventResult = await importEvents();
  const partResult = await importParticipations(userResult.userByLegacyId, eventResult.eventByLegacyId);
  const notifResult = await importJournalisation(eventResult.eventByLegacyId);
  const ambResult = await importAmbassadors(userResult.userByLegacyId);

  // eslint-disable-next-line no-console
  console.log("Legacy import completed.");
  // eslint-disable-next-line no-console
  console.log({
    users: userResult.stats,
    events: eventResult.stats,
    participations: partResult,
    notifications: notifResult,
    ambassadors: ambResult
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
