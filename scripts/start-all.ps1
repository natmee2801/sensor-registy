<#
.SYNOPSIS
    เปิด stack เต็มของ sensor-registry ผ่าน docker แล้วเช็คพอร์ตให้

.DESCRIPTION
    docker compose up -d ด้วย base + prod overlay:
      - mongo (27017), mosquitto (1883 + 9001)
      - backend (3001 -> 3000), frontend/nginx (3000 -> 80)
    ต้องตั้ง ADMIN_KEY (prod บังคับ) — ตั้งใน .env ที่ repo root หรือ env var ก่อนรัน
    จบแล้วเรียก check-ports.ps1 ยืนยันสถานะ

.EXAMPLE
    .\scripts\start-all.ps1
#>

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot  = Split-Path -Parent $scriptDir

Write-Host ""
Write-Host "  เปิด docker stack ของ sensor-registry..." -ForegroundColor Cyan
Write-Host "  ------------------------------------------------------------"

Push-Location $repoRoot
try {
    & docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
} finally {
    Pop-Location
}

Write-Host "  ------------------------------------------------------------"
Write-Host "  รอ container พร้อม ~5 วินาที..." -ForegroundColor DarkGray
Start-Sleep -Seconds 5

& (Join-Path $scriptDir "check-ports.ps1")
