$ErrorActionPreference = 'Stop'

$releaseDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) 'release'
$artifacts = @(Get-ChildItem -LiteralPath $releaseDirectory -File | Where-Object { $_.Name -match '^Chronos-.*-(Setup|Portable)\.exe$' })
$artifactTypes = @($artifacts | ForEach-Object { if ($_.Name -match '-(Setup|Portable)\.exe$') { $Matches[1] } } | Sort-Object -Unique)

if ($artifacts.Count -ne 2 -or $artifactTypes.Count -ne 2 -or 'Setup' -notin $artifactTypes -or 'Portable' -notin $artifactTypes) {
  throw 'Expected exactly one Windows Setup and one Portable executable in release/.'
}

$checksumFile = Join-Path $releaseDirectory 'SHA256SUMS.txt'
if (-not (Test-Path -LiteralPath $checksumFile)) { throw 'SHA256SUMS.txt was not generated.' }
$checksumLines = @(Get-Content -LiteralPath $checksumFile)
if ($checksumLines.Count -ne $artifacts.Count) { throw 'The checksum file does not contain exactly the two Windows packages.' }

foreach ($artifact in $artifacts) {
  if ($artifact.Length -lt 1MB) { throw "$($artifact.Name) is unexpectedly small." }
  $actualHash = (Get-FileHash -LiteralPath $artifact.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  $expectedLine = $checksumLines | Where-Object { $_ -match "^[a-fA-F0-9]{64}  $([regex]::Escape($artifact.Name))$" } | Select-Object -First 1
  $expectedHash = if ($expectedLine) { [regex]::Match($expectedLine, '^[a-fA-F0-9]{64}').Value.ToLowerInvariant() } else { '' }
  if ($expectedHash -ne $actualHash) { throw "Checksum verification failed for $($artifact.Name)." }
}

Write-Output 'Verified Windows Setup and Portable packages against SHA256SUMS.txt.'
