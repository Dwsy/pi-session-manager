param(
  [Parameter(Mandatory = $true)]
  [string]$Artifact
)

$ErrorActionPreference = 'Stop'

$signTool = $env:WINDOWS_SIGNTOOL_PATH
$thumbprint = $env:WINDOWS_SIGN_CERT_SHA1
$timestampUrl = $env:WINDOWS_SIGN_TIMESTAMP_URL

if ([string]::IsNullOrWhiteSpace($signTool)) { throw 'WINDOWS_SIGNTOOL_PATH is required for Authenticode signing' }
if ([string]::IsNullOrWhiteSpace($thumbprint)) { throw 'WINDOWS_SIGN_CERT_SHA1 is required for Authenticode signing' }
if ([string]::IsNullOrWhiteSpace($timestampUrl)) { throw 'WINDOWS_SIGN_TIMESTAMP_URL is required for Authenticode signing' }

& $signTool sign /fd SHA256 /sha1 $thumbprint /tr $timestampUrl /td SHA256 $Artifact
if ($LASTEXITCODE -ne 0) { throw "signtool failed with exit code $LASTEXITCODE" }
