$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$cloudflaredPath = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$port = 3012
$serverProcess = $null
$tunnelProcess = $null
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "mideli-whatsapp-webhook"
$serverOut = Join-Path $tempRoot "next-output.log"
$serverError = Join-Path $tempRoot "next-error.log"
$tunnelOut = Join-Path $tempRoot "tunnel-output.log"
$tunnelError = Join-Path $tempRoot "tunnel-error.log"

function New-PrivateToken {
  $bytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Stop-ProcessTree([System.Diagnostics.Process]$process) {
  if ($null -eq $process -or $process.HasExited) { return }
  & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null
}

if (-not (Test-Path -LiteralPath $cloudflaredPath)) {
  throw "No se encontró cloudflared. Instálalo antes de iniciar el webhook local."
}

if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
  throw "El puerto $port ya está ocupado. Cierra la prueba anterior e intenta nuevamente."
}

New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
Remove-Item -LiteralPath $serverOut, $serverError, $tunnelOut, $tunnelError -Force -ErrorAction SilentlyContinue

$verifyToken = New-PrivateToken
$temporarySigningSecret = New-PrivateToken
Set-Clipboard -Value $verifyToken

$env:WHATSAPP_ORDERS_ENABLED = "true"
$env:WHATSAPP_PROVIDER = "meta"
$env:WHATSAPP_DRY_RUN = "true"
$env:WHATSAPP_TEST_ALLOWLIST = ""
$env:META_WHATSAPP_VERIFY_TOKEN = $verifyToken
$env:META_APP_SECRET = $temporarySigningSecret

try {
  $serverProcess = Start-Process `
    -FilePath "npm.cmd" `
    -ArgumentList @("run", "dev", "--", "--hostname", "127.0.0.1", "--port", "$port") `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $serverOut `
    -RedirectStandardError $serverError `
    -PassThru

  $serverReady = $false
  for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    Start-Sleep -Seconds 1
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$port/" -TimeoutSec 2
      if ($response.StatusCode -lt 500) {
        $serverReady = $true
        break
      }
    } catch {
      if ($serverProcess.HasExited) { break }
    }
  }

  if (-not $serverReady) {
    throw "Mideli no inició en el puerto $port. Revisa $serverError"
  }

  $tunnelProcess = Start-Process `
    -FilePath $cloudflaredPath `
    -ArgumentList @("tunnel", "--url", "http://127.0.0.1:$port", "--no-autoupdate") `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $tunnelOut `
    -RedirectStandardError $tunnelError `
    -PassThru

  $publicUrl = $null
  for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    Start-Sleep -Seconds 1
    $output = ""
    if (Test-Path -LiteralPath $tunnelOut) { $output += Get-Content -LiteralPath $tunnelOut -Raw }
    if (Test-Path -LiteralPath $tunnelError) { $output += Get-Content -LiteralPath $tunnelError -Raw }
    $match = [regex]::Match($output, "https://[a-z0-9-]+\.trycloudflare\.com")
    if ($match.Success) {
      $publicUrl = $match.Value
      break
    }
    if ($tunnelProcess.HasExited) { break }
  }

  if (-not $publicUrl) {
    throw "No se pudo crear el túnel HTTPS. Revisa $tunnelError"
  }

  $callbackUrl = "$publicUrl/api/integraciones/whatsapp/meta"
  Write-Host ""
  Write-Host "Webhook local listo" -ForegroundColor Green
  Write-Host "URL de devolución:" -ForegroundColor Cyan
  Write-Host $callbackUrl
  Write-Host ""
  Write-Host "El token de verificación está copiado en el portapapeles." -ForegroundColor Yellow
  Write-Host "Pégalo directamente en Meta. No lo compartas por chat ni capturas."
  Write-Host "Deja esta ventana abierta mientras Meta verifica la URL."
  Write-Host ""
  Read-Host "Cuando termines la verificación, presiona Enter para cerrar la prueba"
} finally {
  Stop-ProcessTree $tunnelProcess
  Stop-ProcessTree $serverProcess
  Remove-Item -LiteralPath $serverOut, $serverError, $tunnelOut, $tunnelError -Force -ErrorAction SilentlyContinue
}
