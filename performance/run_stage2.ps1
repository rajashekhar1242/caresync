$ErrorActionPreference = 'Stop'
$root = 'Z:\javaproject'
$resDir = Join-Path $root 'performance\results'
$jfrRepo = (Join-Path $resDir 'jfr-repo-2') -replace '\\', '/'
$tmpDir = (Join-Path $resDir 'tmp-2') -replace '\\', '/'
New-Item -ItemType Directory -Force -Path $resDir, $jfrRepo, $tmpDir | Out-Null

$port = if ($env:HCMS_PORT) { $env:HCMS_PORT } else { '18080' }
$baseUrl = "http://localhost:$port"
$env:HCMS_BASE_URL = $baseUrl
$env:HCMS_RESULTS_DIR = $resDir
$env:HCMS_MULTI_IP = '1'

$jar = Join-Path $root 'backend\target\caresync-backend-0.1.0-SNAPSHOT.jar'
$stdoutLog = Join-Path $resDir 'stage2-app.stdout.log'
$stderrLog = Join-Path $resDir 'stage2-app.stderr.log'
$jfrPath = (Join-Path $resDir 'stage2-prod.jfr') -replace '\\', '/'
$gcPath = (Join-Path $resDir 'stage2-gc.log') -replace '\\', '/'

$jvmArgs = @(
  "-Djava.io.tmpdir=$tmpDir",
  "-XX:FlightRecorderOptions=repository=$jfrRepo",
  "-XX:StartFlightRecording=disk=true,dumponexit=true,filename=$jfrPath,settings=profile",
  "-Xlog:gc*:file=${gcPath}:time,uptime,level,tags",
  "-jar", $jar,
  "--server.port=$port",
  "--spring.profiles.active=prod"
)

$proc = Start-Process -FilePath 'java' -ArgumentList $jvmArgs -WorkingDirectory $root `
  -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru

try {
  Write-Host "Started Stage 2 (prod trusted-proxy) PID=$($proc.Id) on $baseUrl"
  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    try {
      $resp = Invoke-RestMethod -Uri "$baseUrl/actuator/health" -TimeoutSec 2
      if ($resp.status -eq 'UP') { $ready = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw "Backend failed to become healthy within 30s. Check $stderrLog" }

  Write-Host "=== Running 01_baseline (Stage 2 multi-IP) ==="
  node "$root\performance\scenarios\01_baseline.mjs"

  Write-Host "=== Running 02_auth_concurrency (Stage 2 multi-IP 10/25/50/100 + refresh/logout races) ==="
  node "$root\performance\scenarios\02_auth_concurrency.mjs"

  Write-Host "=== Running 04_rate_limit_stress (Stage 2 11.5k IPs LRU eviction stress) ==="
  node "$root\performance\scenarios\04_rate_limit_stress.mjs"

  Write-Host "=== Seeding Large Synthetic Dataset (5 clinics, 25 depts, 100 docs, 10k patients, 50k appts, 30k invoices, 40k payments, 100k audits) ==="
  Get-Content "$root\performance\dataset\seed_large_dataset.sql" -Raw | docker exec -i hcms-perf-pg psql -v ON_ERROR_STOP=1 -U caresync -d hcms_perf

  Write-Host "=== Running 06_scale_and_reports against 50k/100k dataset ==="
  node "$root\performance\scenarios\06_scale_and_reports.mjs"

  Write-Host "=== Running Phase G EXPLAIN (ANALYZE, BUFFERS) & pg_stat inspection ==="
  Get-Content "$root\performance\db\explain_queries.sql" -Raw | docker exec -i hcms-perf-pg psql -v ON_ERROR_STOP=1 -U caresync -d hcms_perf > (Join-Path $resDir 'explain_plans.txt')

  Write-Host "=== Capturing Stage 2 JVM, JFR & Actuator Snapshot ==="
  & jcmd $proc.Id JFR.dump name=1 filename="$jfrPath" | Out-Null
  & jstat -gcutil $proc.Id 1 1 > (Join-Path $resDir 'stage2-jstat.txt')
  & jcmd $proc.Id GC.heap_info > (Join-Path $resDir 'stage2-heap.txt')
  $loginBody = @{ email = $env:HCMS_ADMIN_EMAIL; password = $env:HCMS_ADMIN_PASSWORD } | ConvertTo-Json
  $loginResp = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/auth/login" -Headers @{ 'X-Forwarded-For' = '10.99.99.1' } -ContentType 'application/json' -Body $loginBody
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
  $metricsOut | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $resDir 'stage2-metrics.json')
} finally {
  if ($proc -and -not $proc.HasExited) {
    Write-Host "Stopping Stage 2 PID=$($proc.Id) gracefully..."
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    $proc.WaitForExit(10000) | Out-Null
  }
}
