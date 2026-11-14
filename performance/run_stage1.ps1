$ErrorActionPreference = 'Stop'
$root = 'Z:\javaproject'
$resDir = Join-Path $root 'performance\results'
$jfrRepo = (Join-Path $resDir 'jfr-repo-1') -replace '\\', '/'
$tmpDir = (Join-Path $resDir 'tmp-1') -replace '\\', '/'
New-Item -ItemType Directory -Force -Path $resDir, $jfrRepo, $tmpDir | Out-Null

$port = if ($env:HCMS_PORT) { $env:HCMS_PORT } else { '18080' }
$baseUrl = "http://localhost:$port"
$env:HCMS_BASE_URL = $baseUrl
$env:HCMS_RESULTS_DIR = $resDir
$env:HCMS_MULTI_IP = '0'

$jar = Join-Path $root 'backend\target\caresync-backend-0.1.0-SNAPSHOT.jar'
$stdoutLog = Join-Path $resDir 'stage1-app.stdout.log'
$stderrLog = Join-Path $resDir 'stage1-app.stderr.log'
$jfrPath = (Join-Path $resDir 'stage1-dev.jfr') -replace '\\', '/'
$gcPath = (Join-Path $resDir 'stage1-gc.log') -replace '\\', '/'

$jvmArgs = @(
  "-Djava.io.tmpdir=$tmpDir",
  "-XX:FlightRecorderOptions=repository=$jfrRepo",
  "-XX:StartFlightRecording=disk=true,dumponexit=true,filename=$jfrPath,settings=profile",
  "-Xlog:gc*:file=${gcPath}:time,uptime,level,tags",
  "-jar", $jar,
  "--server.port=$port",
  "--spring.profiles.active=dev"
)

$proc = Start-Process -FilePath 'java' -ArgumentList $jvmArgs -WorkingDirectory $root `
  -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru

try {
  Write-Host "Started Stage 1 (dev) PID=$($proc.Id) on $baseUrl"
  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    try {
      $resp = Invoke-RestMethod -Uri "$baseUrl/actuator/health" -TimeoutSec 2
      if ($resp.status -eq 'UP') { $ready = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw "Backend failed to become healthy within 30s. Check $stderrLog" }

  Write-Host "=== Running 01_baseline (Stage 1 dev single-IP) ==="
  node "$root\performance\scenarios\01_baseline.mjs"

  Write-Host "=== Waiting 62s for single-IP /api/auth/login bucket refill before 03_booking_races ==="
  Start-Sleep -Seconds 62

  Write-Host "=== Running 03_booking_races (Stage 1 single-IP) ==="
  node "$root\performance\scenarios\03_booking_races.mjs"

  Write-Host "=== Waiting 20s for /api/auth/login token refill before 05_queue_websocket ==="
  Start-Sleep -Seconds 20

  Write-Host "=== Running 05_queue_websocket (Stage 1) ==="
  node "$root\performance\scenarios\05_queue_websocket.mjs"

  Write-Host "=== Waiting 20s for /api/auth/login refill before 02_auth_concurrency ==="
  Start-Sleep -Seconds 20

  Write-Host "=== Running 02_auth_concurrency (dev single-IP) ==="
  node "$root\performance\scenarios\02_auth_concurrency.mjs"

  Write-Host "=== Waiting 62s for /api/auth/login refill before 04_rate_limit_stress ==="
  Start-Sleep -Seconds 62

  Write-Host "=== Running 04_rate_limit_stress (dev single-IP mode) ==="
  node "$root\performance\scenarios\04_rate_limit_stress.mjs"

  Write-Host "=== Capturing Stage 1 JVM, JFR & Actuator Snapshot ==="
  & jcmd $proc.Id JFR.dump name=1 filename="$jfrPath" | Out-Null
  & jstat -gcutil $proc.Id 1 1 > (Join-Path $resDir 'stage1-jstat.txt')
  & jcmd $proc.Id GC.heap_info > (Join-Path $resDir 'stage1-heap.txt')
  $loginBody = @{ email = $env:HCMS_ADMIN_EMAIL; password = $env:HCMS_ADMIN_PASSWORD } | ConvertTo-Json
  $loginResp = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/auth/login" -ContentType 'application/json' -Body $loginBody
  $hdr = @{ Authorization = "Bearer $($loginResp.accessToken)" }
  $metricNames = @(
    'jvm.memory.used', 'jvm.memory.max', 'jvm.gc.pause', 'jvm.threads.live', 'jvm.threads.peak',
    'process.cpu.usage', 'system.cpu.usage', 'hikaricp.connections.active', 'hikaricp.connections.idle',
    'hikaricp.connections.pending', 'hikaricp.connections.acquire', 'hikaricp.connections.usage',
    'http.server.requests'
  )
  $metricsOut = @{}
  foreach ($m in $metricNames) {
    try {
      $metricsOut[$m] = Invoke-RestMethod -Uri "$baseUrl/actuator/metrics/$m" -Headers $hdr -TimeoutSec 3
    } catch {
      $metricsOut[$m] = @{ error = $_.Exception.Message }
    }
  }
  $metricsOut | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $resDir 'stage1-metrics.json')
} finally {
  if ($proc -and -not $proc.HasExited) {
    Write-Host "Stopping Stage 1 PID=$($proc.Id) gracefully..."
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    $proc.WaitForExit(10000) | Out-Null
  }
}
