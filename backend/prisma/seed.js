const { PrismaClient, UserRole } = require("@prisma/client");

const prisma = new PrismaClient();

const DEFAULT_EVENTS = [
  {
    code: "EVT-001",
    type: "Forum",
    title: "Forum etudiants - Paris",
    date: "2026-03-20",
    city: "Paris",
    location: "Porte de Versailles",
    startTime: "09:00",
    endTime: "17:00",
    hours: "09:00 - 17:00",
    need: 4,
    contactName: "Mme Martin",
    contactEmail: "martin@ecole.fr",
    contactPhone: "01 23 45 67 89",
    description: "Accueil visiteurs, presentation formations, collecte contacts."
  },
  {
    code: "EVT-002",
    type: "Intervention",
    title: "Intervention Lycee - Creteil",
    date: "2026-03-27",
    city: "Creteil",
    location: "Lycee Jules Ferry",
    startTime: "10:00",
    endTime: "12:00",
    hours: "10:00 - 12:00",
    need: 2,
    contactName: "M. Diallo",
    contactEmail: "diallo@ecole.fr",
    contactPhone: "01 98 76 54 32",
    description: "Presentation ecole + echanges avec eleves."
  },
  {
    code: "EVT-003",
    type: "Evenement ecole",
    title: "JPO Campus - Lyon",
    date: "2026-04-05",
    city: "Lyon",
    location: "Campus Lyon",
    startTime: "09:30",
    endTime: "16:30",
    hours: "09:30 - 16:30",
    need: 6,
    contactName: "Service Admissions",
    contactEmail: "admissions@ecole.fr",
    contactPhone: "04 11 22 33 44",
    description: "Guidage, temoignage etudiant, orientation visiteurs."
  },
  {
    code: "EVT-004",
    type: "Salon",
    title: "Salon de l'etudiant - Lille",
    date: "2026-04-18",
    city: "Lille",
    location: "Grand Palais",
    startTime: "09:00",
    endTime: "18:00",
    hours: "09:00 - 18:00",
    need: 5,
    contactName: "Mme Bernard",
    contactEmail: "bernard@ecole.fr",
    contactPhone: "03 20 11 22 33",
    description: "Salon : orientation, presentation ecole, collecte contacts."
  }
];

function dateOnlyToUTC(dateIso) {
  return new Date(`${dateIso}T00:00:00.000Z`);
}

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: "admissions@ecole.fr" },
    update: { role: UserRole.ADMISSIONS, isActive: true },
    create: {
      email: "admissions@ecole.fr",
      role: UserRole.ADMISSIONS,
      name: "Admissions"
    }
  });

  for (const e of DEFAULT_EVENTS) {
    await prisma.event.upsert({
      where: { code: e.code },
      update: {
        ...e,
        date: dateOnlyToUTC(e.date),
        createdById: admin.id
      },
      create: {
        ...e,
        date: dateOnlyToUTC(e.date),
        createdById: admin.id
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Seed done.");
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
