<#
.SYNOPSIS
    เช็คสถานะบริการของ sensor-registry "ตาม docker" — ดึงพอร์ตจาก docker compose โดยตรง

.DESCRIPTION
    อ่าน `docker compose ps` (base + prod overlay) แล้วสำหรับแต่ละ service:
      - แสดง State ของ container (running / exited / ไม่มี)
      - ดึงพอร์ตที่ publish ออก host จริงจาก compose (ไม่ hardcode)
      - ทดสอบ TCP ไปยังพอร์ตนั้นบน host ที่ระบุ
    ทำให้ผลตรงกับสิ่งที่ docker เปิดจริงเสมอ ไม่ว่าจะแก้ port mapping ยังไง

.PARAMETER TargetHost
    Host ที่จะทดสอบ TCP (default: localhost). ใส่ IP บน LAN เพื่อเช็คจากมุมของ ESP/เครื่องอื่น
    เช่น:  .\scripts\check-ports.ps1 -TargetHost 192.168.149.185

.EXAMPLE
    .\scripts\check-ports.ps1
    .\scripts\check-ports.ps1 -TargetHost 192.168.149.185
#>

param(
    [string]$TargetHost = "localhost"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot  = Split-Path -Parent $scriptDir

# compose files ที่ประกอบเป็น stack เต็ม (base = infra, prod = backend + frontend)
$composeArgs = @(
    "compose",
    "-f", (Join-Path $repoRoot "docker-compose.yml"),
    "-f", (Join-Path $repoRoot "docker-compose.prod.yml"),
    "ps", "--all", "--format", "json"
)

function Test-Port([string]$H, [int]$Port) {
    $tcp = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $tcp.BeginConnect($H, $Port, $null, $null)
        if ($async.AsyncWaitHandle.WaitOne(1500)) {
            $tcp.EndConnect($async); return $tcp.Connected
        }
        return $false
    } catch { return $false } finally { $tcp.Close() }
}

Write-Host ""
Write-Host "  เช็คบริการ sensor-registry ตาม docker — host: " -NoNewline
Write-Host "$TargetHost" -ForegroundColor Cyan
Write-Host "  ------------------------------------------------------------"

# ดึงสถานะจาก docker (แต่ละบรรทัด = 1 JSON object)
try {
    $raw = & docker @composeArgs
} catch {
    Write-Host "  docker ไม่ตอบสนอง — Docker Desktop รันอยู่ไหม?" -ForegroundColor Red
    exit 2
}

$services = @()
foreach ($line in $raw) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    try { $services += ($line | ConvertFrom-Json) } catch { }
}

if ($services.Count -eq 0) {
    Write-Host "  ไม่มี container เลย — ยังไม่ได้ up?" -ForegroundColor Yellow
    Write-Host "  -> docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d" -ForegroundColor DarkGray
    Write-Host ""
    exit 1
}

$allGood = $true

foreach ($svc in ($services | Sort-Object Service)) {
    $running = $svc.State -eq "running"

    # สถานะ container
    if ($running) {
        Write-Host "  [ UP  ] " -ForegroundColor Green -NoNewline
    } else {
        Write-Host "  [ DOWN] " -ForegroundColor Red -NoNewline
        $allGood = $false
    }
    Write-Host ("{0,-10} {1}" -f $svc.Service, $svc.Status)

    # พอร์ตที่ publish ออก host — ทดสอบ TCP ทีละพอร์ต
    $published = @()
    if ($svc.Publishers) {
        $published = $svc.Publishers |
            Where-Object { $_.PublishedPort -gt 0 } |
            Select-Object -ExpandProperty PublishedPort -Unique |
            Sort-Object
    }

    if ($published.Count -eq 0) {
        Write-Host "           (ไม่ publish พอร์ตออก host)" -ForegroundColor DarkGray
        continue
    }

    foreach ($port in $published) {
        $open = Test-Port $TargetHost $port
        if ($open) {
            Write-Host "           port $port  " -NoNewline
            Write-Host "OPEN" -ForegroundColor Green
        } else {
            Write-Host "           port $port  " -NoNewline
            Write-Host "CLOSED" -ForegroundColor Red
            $allGood = $false
        }
    }
}

Write-Host "  ------------------------------------------------------------"
if ($allGood) {
    Write-Host "  ทุก container running และพอร์ตเปิดครบ" -ForegroundColor Green
    Write-Host ""
    exit 0
} else {
    Write-Host "  มี container/พอร์ตที่ยังไม่พร้อม" -ForegroundColor Yellow
    Write-Host "  -> docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d" -ForegroundColor DarkGray
    Write-Host ""
    exit 1
}
