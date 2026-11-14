$ErrorActionPreference = 'Stop'
$root = 'Z:\javaproject'
$resDir = Join-Path $root 'performance\results_phase16_1'
New-Item -ItemType Directory -Force -Path $resDir | Out-Null

$port = '18080'
$baseUrl = "http://localhost:$port"
$env:HCMS_BASE_URL = $baseUrl
$env:HCMS_ADMIN_EMAIL = 'admin@caresync.local'
$env:HCMS_ADMIN_PASSWORD = 'AdminPass!123'
$env:HCMS_RECEPTIONIST_EMAIL = 'reception@caresync.local'
$env:HCMS_RECEPTIONIST_PASSWORD = 'ReceptPass!123'
$env:CARESYNC_ADMIN_EMAIL = 'admin@caresync.local'
$env:CARESYNC_ADMIN_PASSWORD = 'AdminPass!123'
$env:CARESYNC_RECEPTIONIST_EMAIL = 'reception@caresync.local'
$env:CARESYNC_RECEPTIONIST_PASSWORD = 'ReceptPass!123'
$env:HCMS_RESULTS_DIR = $resDir
$env:HCMS_MULTI_IP = '1'

$jar = Join-Path $root 'backend\target\caresync-backend-0.1.0-SNAPSHOT.jar'
$stdoutLog = Join-Path $resDir 'remediation-app.stdout.log'
$stderrLog = Join-Path $resDir 'remediation-app.stderr.log'

$jvmArgs = @(
  "-jar", $jar,
  "--server.port=$port",
  "--spring.profiles.active=prod",
  "--spring.datasource.url=jdbc:postgresql://localhost:5432/caresync",
  "--spring.datasource.username=caresync",
  "--spring.datasource.password=caresync_perf_pass",
  "--caresync.jwt.secret=remediation-perf-jwt-secret-at-least-32-bytes-long!",
  "--caresync.bootstrap.admin.email=admin@caresync.local",
  "--caresync.bootstrap.admin.password=AdminPass!123",
  "--caresync.bootstrap.receptionist.email=reception@caresync.local",
  "--caresync.bootstrap.receptionist.password=ReceptPass!123"
)

$proc = Start-Process -FilePath 'java' -ArgumentList $jvmArgs -WorkingDirectory $root `
  -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru

try {
  Write-Host "Started Remediation Backend PID=$($proc.Id) on $baseUrl"
  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    try {
      $resp = Invoke-RestMethod -Uri "$baseUrl/actuator/health" -TimeoutSec 2
      if ($resp.status -eq 'UP') { $ready = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw "Backend failed to become healthy within 30s. Check $stderrLog" }

  Write-Host "=== Running 03_booking_races (Testing CRITICAL-01 Concurrent Check-In Tokens at c=25) ==="
  node "$root\performance\scenarios\03_booking_races.mjs"

  Write-Host "=== Running 02_auth_concurrency (Testing CRITICAL-02 Concurrent Refresh-Token Race at c=25) ==="
  node "$root\performance\scenarios\02_auth_concurrency.mjs"

  Write-Host "=== Capturing Actuator Metrics Snapshot ==="
  $loginBody = @{ email = $env:HCMS_ADMIN_EMAIL; password = $env:HCMS_ADMIN_PASSWORD } | ConvertTo-Json
  $loginResp = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/auth/login" -ContentType 'application/json' -Body $loginBody
  $hdr = @{ Authorization = "Bearer $($loginResp.accessToken)" }
  $metricNames = @(
    'hikaricp.connections.active', 'hikaricp.connections.idle',
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
  $metricsOut | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $resDir 'remediation-metrics.json')
  Write-Host "=== All Remediation Benchmarks Completed Successfully! ==="
} finally {
  if ($proc -and -not $proc.HasExited) {
    Write-Host "Stopping Remediation Backend PID=$($proc.Id) gracefully..."
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    $proc.WaitForExit(10000) | Out-Null
  }
}
