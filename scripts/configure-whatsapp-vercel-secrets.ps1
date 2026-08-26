Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectDirectory = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDirectory

function Read-PrivateValue {
  param([Parameter(Mandatory = $true)][string]$Prompt)

  $secureValue = Read-Host -Prompt $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function Set-PrivateVercelValue {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Value
  )

  $Value | & npx vercel env add $Name production --yes --force --sensitive
  if ($LASTEXITCODE -ne 0) {
    throw "No se pudo guardar $Name en Vercel."
  }
}

try {
  Write-Host ""
  Write-Host "Configuracion privada de WhatsApp" -ForegroundColor Cyan
  Write-Host "Los caracteres no apareceran mientras escribe. Es normal." -ForegroundColor DarkGray
  Write-Host "Las credenciales se guardaran cifradas en Vercel y no en el proyecto." -ForegroundColor DarkGray
  Write-Host ""

  $appSecret = Read-PrivateValue "1 de 4. App Secret de Meta"
  Set-PrivateVercelValue "META_APP_SECRET" $appSecret

  $accessToken = Read-PrivateValue "2 de 4. Token de acceso de Meta"
  Set-PrivateVercelValue "META_WHATSAPP_ACCESS_TOKEN" $accessToken

  Write-Host "Cree una frase privada para verificar el webhook y anotela." -ForegroundColor Yellow
  $verifyToken = Read-PrivateValue "3 de 4. Clave de verificacion elegida por usted"
  Set-PrivateVercelValue "META_WHATSAPP_VERIFY_TOKEN" $verifyToken

  $mapsKey = Read-PrivateValue "4 de 4. API key de Google Maps para servidor"
  Set-PrivateVercelValue "GOOGLE_MAPS_SERVER_API_KEY" $mapsKey

  $appSecret = $null
  $accessToken = $null
  $verifyToken = $null
  $mapsKey = $null
  [GC]::Collect()

  Write-Host ""
  Write-Host "Credenciales guardadas correctamente en Vercel." -ForegroundColor Green
}
catch {
  Write-Host ""
  Write-Host "No se completo la configuracion: $($_.Exception.Message)" -ForegroundColor Red
}
finally {
  Write-Host ""
  Read-Host "Presione Enter para cerrar esta ventana"
}
