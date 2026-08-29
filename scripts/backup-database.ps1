param([string]$OutputDirectory = $env:BACKUP_OUTPUT_DIR)
$ErrorActionPreference = 'Stop'
if (-not $env:DATABASE_URL) { throw 'DATABASE_URL is required' }
if (-not $OutputDirectory) { throw 'BACKUP_OUTPUT_DIR or -OutputDirectory is required' }
if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) { throw 'pg_dump is not installed or not on PATH' }
$resolvedRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $resolvedRoot -Force | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$target = Join-Path $resolvedRoot "oiano-$stamp.dump"
& pg_dump --dbname=$env:DATABASE_URL --format=custom --no-owner --no-acl --file=$target
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash.ToLowerInvariant()
$manifest = [ordered]@{ created_at=(Get-Date).ToUniversalTime().ToString('o'); file=[System.IO.Path]::GetFileName($target); bytes=(Get-Item -LiteralPath $target).Length; sha256=$hash }
$manifest | ConvertTo-Json | Set-Content -LiteralPath "$target.json" -Encoding utf8
$retention = if ($env:BACKUP_RETENTION_DAYS) { [int]$env:BACKUP_RETENTION_DAYS } else { 35 }
$cutoff = (Get-Date).ToUniversalTime().AddDays(-$retention)
Get-ChildItem -LiteralPath $resolvedRoot -Filter 'oiano-*.dump' -File | Where-Object LastWriteTimeUtc -lt $cutoff | ForEach-Object { Write-Warning "Expired backup requires reviewed removal: $($_.FullName)" }
Write-Output ($manifest | ConvertTo-Json -Compress)
