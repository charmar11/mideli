$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$cloudflaredPath = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$port = 3012
$serverProcess = $null
$tunnelProcess = $null
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "mideli-whatsapp-meta-pilot"
$serverOut = Join-Path $tempRoot "next-output.log"
$serverError = Join-Path $tempRoot "next-error.log"
$tunnelOut = Join-Path $tempRoot "tunnel-output.log"
$tunnelError = Join-Path $tempRoot "tunnel-error.log"

function New-PrivateToken {
  $bytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Read-PrivateValue([string]$prompt) {
  $secureValue = Read-Host $prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function Test-TcpPort([string]$targetHost, [int]$targetPort) {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $connection = $client.ConnectAsync($targetHost, $targetPort)
    if (-not $connection.Wait(1000)) { return $false }
    return $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Stop-ProcessTree([System.Diagnostics.Process]$process) {
  if ($null -eq $process -or $process.HasExited) { return }
  & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null
}

if (-not (Test-Path -LiteralPath $cloudflaredPath)) {
  throw "No se encontró cloudflared. Codex debe instalarlo antes de iniciar el piloto."
}

if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
  throw "El puerto $port ya está ocupado. Cierra la prueba anterior e intenta nuevamente."
}

Write-Host "Configuración privada del piloto de WhatsApp" -ForegroundColor Cyan
Write-Host "Los valores se mantienen solo en este proceso y no se guardan en archivos."
Write-Host "Al pegar secretos no verás caracteres en pantalla. Es normal."
Write-Host ""

$appSecret = Read-PrivateValue "Pega el App Secret de Meta"
$accessToken = Read-PrivateValue "Pega el token de acceso temporal de WhatsApp"
$phoneNumberId = (Read-Host "Pega el Phone Number ID").Trim()
$testPhone = (Read-Host "Escribe tu teléfono de prueba con código de país, solo números") -replace '\D', ''

if ([string]::IsNullOrWhiteSpace($appSecret)) { throw "Falta el App Secret." }
if ([string]::IsNullOrWhiteSpace($accessToken)) { throw "Falta el token temporal." }
if ($phoneNumberId -notmatch '^\d+$') { throw "El Phone Number ID no es válido." }
if ($testPhone -notmatch '^\d{8,15}$') { throw "El teléfono de prueba no es válido." }

New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
Remove-Item -LiteralPath $serverOut, $serverError, $tunnelOut, $tunnelError -Force -ErrorAction SilentlyContinue

$verifyToken = New-PrivateToken
Set-Clipboard -Value $verifyToken

$env:WHATSAPP_ORDERS_ENABLED = "true"
$env:WHATSAPP_PROVIDER = "meta"
$env:WHATSAPP_DRY_RUN = "true"
$env:WHATSAPP_TEST_ALLOWLIST = $testPhone
$env:META_WHATSAPP_VERIFY_TOKEN = $verifyToken
$env:META_APP_SECRET = $appSecret
$env:META_WHATSAPP_ACCESS_TOKEN = $accessToken
$env:META_WHATSAPP_PHONE_NUMBER_ID = $phoneNumberId

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
    if (Test-TcpPort "127.0.0.1" $port) {
      $serverReady = $true
      break
    }
    if ($serverProcess.HasExited) { break }
  }

  if (-not $serverReady) {
    throw "Mideli no inició. Codex puede revisar el registro técnico sin mostrar secretos."
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
    throw "No se pudo crear el túnel HTTPS. Codex puede revisar el registro técnico."
  }

  Write-Host ""
  Write-Host "Piloto seguro listo en modo de prueba" -ForegroundColor Green
  Write-Host "URL de devolución:" -ForegroundColor Cyan
  Write-Host "$publicUrl/api/integraciones/whatsapp/meta"
  Write-Host ""
  Write-Host "El token de verificación está copiado en el portapapeles." -ForegroundColor Yellow
  Write-Host "Actualiza ambos datos en Meta y conserva desactivado el certificado de cliente."
  Write-Host "Después envía Hola desde el teléfono permitido al número de prueba."
  Write-Host "Ningún pedido afectará cocina, caja, inventario o impresión."
  Write-Host "Deja esta ventana abierta durante la prueba."
  Write-Host ""
  while ($true) {
    $action = (Read-Host "Escribe U para copiar la URL, T para copiar el token o presiona Enter para cerrar").Trim()
    if ([string]::IsNullOrWhiteSpace($action)) { break }
    if ($action -ieq "U") {
      Set-Clipboard -Value "$publicUrl/api/integraciones/whatsapp/meta"
      Write-Host "URL copiada." -ForegroundColor Green
      continue
    }
    if ($action -ieq "T") {
      Set-Clipboard -Value $verifyToken
      Write-Host "Token de verificación copiado." -ForegroundColor Green
      continue
    }
    Write-Host "Opción no reconocida. Usa U, T o Enter." -ForegroundColor Yellow
  }
} finally {
  Stop-ProcessTree $tunnelProcess
  Stop-ProcessTree $serverProcess
  Remove-Item -LiteralPath $serverOut, $serverError, $tunnelOut, $tunnelError -Force -ErrorAction SilentlyContinue
  Remove-Item Env:WHATSAPP_ORDERS_ENABLED -ErrorAction SilentlyContinue
  Remove-Item Env:WHATSAPP_PROVIDER -ErrorAction SilentlyContinue
  Remove-Item Env:WHATSAPP_DRY_RUN -ErrorAction SilentlyContinue
  Remove-Item Env:WHATSAPP_TEST_ALLOWLIST -ErrorAction SilentlyContinue
  Remove-Item Env:META_WHATSAPP_VERIFY_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:META_APP_SECRET -ErrorAction SilentlyContinue
  Remove-Item Env:META_WHATSAPP_ACCESS_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:META_WHATSAPP_PHONE_NUMBER_ID -ErrorAction SilentlyContinue
}
