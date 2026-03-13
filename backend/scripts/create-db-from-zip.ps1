param(
  [string]$MysqlUser = "root",
  [string]$MysqlPassword = "",
  [string]$MysqlHost = "localhost",
  [int]$MysqlPort = 3306,
  [string]$Database = "admission_esiee",
  [string]$DumpDir = "C:\Users\khore\Documents\Works\ESIEE-IT\Projet\Dump20260312\Dump20260312"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command mysql -ErrorAction SilentlyContinue)) {
  throw "mysql n'est pas installe ou introuvable dans le PATH."
}

if (-not (Test-Path $DumpDir)) {
  throw "Dossier de dumps introuvable: $DumpDir"
}

$orderedFiles = @(
  "admission_esiee_type_utilisateur.sql",
  "admission_esiee_type_evenement.sql",
  "admission_esiee_etablissement.sql",
  "admission_esiee_personne.sql",
  "admission_esiee_contact.sql",
  "admission_esiee_evenement.sql",
  "admission_esiee_fiche_contact.sql",
  "admission_esiee_participer.sql",
  "admission_esiee_journalisation.sql",
  "admission_esiee_liste_ambassadeur.sql"
)

foreach ($name in $orderedFiles) {
  $full = Join-Path $DumpDir $name
  if (-not (Test-Path $full)) {
    throw "Fichier SQL manquant: $full"
  }
}

$env:MYSQL_PWD = $MysqlPassword
try {
  Write-Host "Creation de la base '$Database'..."
  & mysql --host=$MysqlHost --port=$MysqlPort --user=$MysqlUser --default-character-set=utf8mb4 -e "CREATE DATABASE IF NOT EXISTS $Database CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
  if ($LASTEXITCODE -ne 0) {
    throw "Echec de creation de la base."
  }

  foreach ($name in $orderedFiles) {
    $full = Join-Path $DumpDir $name
    Write-Host "Import: $name"
    Get-Content -Raw -Encoding UTF8 $full | & mysql --host=$MysqlHost --port=$MysqlPort --user=$MysqlUser --default-character-set=utf8mb4 $Database
    if ($LASTEXITCODE -ne 0) {
      throw "Echec import sur $name"
    }
  }

  Write-Host "Base '$Database' creee et importee avec succes."
}
finally {
  Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
}
