# Backend ESIEE Engagement

Backend Node.js + Express + Prisma + MySQL, aligne sur les fonctionnalites du frontend (`frontend/`).

## Stack

- Node.js + Express (API REST)
- Prisma ORM
- MySQL
- JWT (auth prototype)

## Installation

1. Copier l'environnement:

```bash
cp .env.example .env
```

2. Renseigner `DATABASE_URL` dans `.env`.

3. Installer:

```bash
npm install
```

4. Generer Prisma + migrer:

```bash
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run prisma:seed
```

Optionnel (si tu as deja la base legacy `admission_esiee` avec tables `personne`, `evenement`, `participer`, etc.) :

```bash
npm run import:legacy
```

Cette commande importe tes donnees legacy dans les tables API (User/Event/Participation...).
Si tu utilises `import:legacy`, tu peux sauter `prisma:seed`.

## Creation de la base depuis le zip SQL

Si tu as les dumps `admission_esiee_*.sql`, tu peux creer/importer la base en une commande:

```bash
npm run db:create:zip
```

Avec identifiants explicites:

```bash
powershell -ExecutionPolicy Bypass -File ./scripts/create-db-from-zip.ps1 `
  -MysqlUser root `
  -MysqlPassword "ton_mdp_mysql" `
  -MysqlHost localhost `
  -MysqlPort 3306 `
  -Database admission_esiee `
  -DumpDir "C:\Users\khore\Documents\Works\ESIEE-IT\Projet\Dump20260312\Dump20260312"
```

5. Lancer l'API:

```bash
npm run dev
```

API par defaut: `http://localhost:4000`

## Principales routes

### Health
- `GET /api/health`

### Auth
- `POST /api/auth/student/login`
- `POST /api/auth/student/register`
- `POST /api/auth/admin/login`

### Student (token etudiant)
- `GET /api/students/me`
- `PUT /api/students/me` (inclut modification email)
- `GET /api/students/me/participations`

### Events
- `GET /api/events`
- `GET /api/events/:eventCode`
- `GET /api/events/summary/types` (admin)
- `POST /api/events` (admin)
- `PUT /api/events/:eventCode` (admin)
- `DELETE /api/events/:eventCode` (admin)
- `GET /api/events/:eventCode/participations` (admin)

### Participations
- `POST /api/participations/events/:eventCode` (student: ouvrir dossier)
- `GET /api/participations/:partCode`
- `PUT /api/participations/:partCode/inscription`
- `POST /api/participations/:partCode/withdraw`
- `PUT /api/participations/:partCode/presence`
- `PUT /api/participations/:partCode/defraiement`
- `PUT /api/participations/:partCode/internal` (admin)
- `DELETE /api/participations/:partCode` (admin)

### Notifications (admin)
- `GET /api/notifications`
- `DELETE /api/notifications`

## Regles metier implementees

- Blocage inscription le jour J.
- Blocage inscription si quota valide atteint.
- Possibilite de retrait etudiant.
- Deblocage Presence/Defraiement a partir de la date de l'evenement.
- Justificatif obligatoire si presence = oui.
- Calcul defraiement (voiture + petit-dejeuner salon).
- Notifications admin lors des actions clefs.
- Suppression etudiant d'un evenement cote admissions.
- CRUD evenement cote admissions.

## Notes

- Ce backend est un prototype fonctionnel (auth simplifiee par email + JWT).
- Les justificatifs sont stockes en DataURL (comme le frontend actuel).
- Les dumps legacy `admission_esiee_*.sql` peuvent etre reutilises avec `npm run import:legacy`.
