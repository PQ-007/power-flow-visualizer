<#
.SYNOPSIS
  Saves one Power Automate flow run (status, errors and the inputs/outputs of every action) to a
  JSON file that Power Flow Visualizer can overlay on the flow diagram.

.DESCRIPTION
  Runs on your own machine with your own sign-in; Power Flow Visualizer itself never connects to
  anything. Uses the same service API the Power Automate portal uses to show run history
  (api.flow.microsoft.com). That API is not officially documented and may change.

  Authentication: by default asks the Azure CLI for a token (run `az login` first). Alternatively
  pass -AccessToken.

  The temporary download links (SAS URLs) for inputs/outputs are never written to the file.
  The file can contain personal or business data from the run: keep it local, don't commit it.

.PARAMETER EnvironmentId
  The environment from the flow's URL: https://make.powerautomate.com/environments/<EnvironmentId>/flows/<FlowId>/...

.PARAMETER FlowId
  The flow GUID from the same URL.

.PARAMETER RunId
  The run id from the run's URL (.../runs/<RunId>). Omit it to take the most recent run.

.PARAMETER Failed
  With no -RunId: take the most recent failed run instead of the most recent run.

.PARAMETER NoData
  Don't download action inputs/outputs (statuses, timings and errors only).

.PARAMETER OutFile
  Where to write the JSON. Default: run-<RunId>.json in the current folder.

.EXAMPLE
  ./export-run.ps1 -EnvironmentId Default-1234... -FlowId 5678... -Failed

.EXAMPLE
  ./export-run.ps1 -EnvironmentId Default-1234... -FlowId 5678... -RunId 08584... -OutFile ./run.json
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $EnvironmentId,
  [Parameter(Mandatory)] [string] $FlowId,
  [string] $RunId,
  [switch] $Failed,
  [switch] $NoData,
  [string] $AccessToken,
  [string] $OutFile
)

$ErrorActionPreference = 'Stop'
$apiVersion = 'api-version=2016-11-01'
$flowBase = "https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/$EnvironmentId/flows/$FlowId"

if (-not $AccessToken) {
  if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw 'Azure CLI (az) not found. Install it and run "az login", or pass -AccessToken.'
  }
  $AccessToken = az account get-access-token --resource 'https://service.flow.microsoft.com/' --query accessToken -o tsv
  if (-not $AccessToken) { throw 'Could not get a token. Run "az login" first, or pass -AccessToken.' }
}
$headers = @{ Authorization = "Bearer $AccessToken" }

function Invoke-Flow([string] $Path) {
  Invoke-RestMethod -Headers $headers -Uri "$flowBase$Path"
}

# Pick the run.
if (-not $RunId) {
  $runs = (Invoke-Flow "/runs?$apiVersion&`$top=50").value
  if ($Failed) { $runs = @($runs | Where-Object { $_.properties.status -eq 'Failed' }) }
  if (-not $runs) { throw ($(if ($Failed) { 'No failed run among the last 50.' } else { 'No runs found.' })) }
  $RunId = $runs[0].name
  Write-Host "Using run $RunId ($($runs[0].properties.status), $($runs[0].properties.startTime))"
}

$run = Invoke-Flow "/runs/$RunId`?$apiVersion&`$expand=properties/actions,properties/flow"
$actionSource = $run.properties.actions
if (-not $actionSource) {
  # Fallback: the separate actions list.
  $actionSource = [ordered]@{}
  foreach ($a in (Invoke-Flow "/runs/$RunId/actions?$apiVersion").value) { $actionSource[$a.name] = $a.properties }
}

# Inputs/outputs live behind short-lived links; fetch them without our token.
function Get-LinkedContent($link) {
  if ($NoData -or -not $link -or -not $link.uri) { return $null }
  try { return Invoke-RestMethod -Uri $link.uri }
  catch { Write-Warning "Could not download content: $($_.Exception.Message)"; return $null }
}

function Convert-Result($name, $p) {
  $entry = [ordered]@{ name = $name; status = $p.status }
  foreach ($key in 'code', 'startTime', 'endTime', 'error', 'repetitionCount') {
    if ($null -ne $p.$key) { $entry[$key] = $p.$key }
  }
  foreach ($kind in 'inputs', 'outputs') {
    $link = $p."${kind}Link"
    $content = Get-LinkedContent $link
    if ($null -ne $content) { $entry[$kind] = $content }
    elseif ($link) { $entry["${kind}Link"] = @{ omitted = $true } } # tells the app data exists
  }
  return $entry
}

$actions = [ordered]@{}
$names = if ($actionSource -is [System.Collections.IDictionary]) { $actionSource.Keys } else { $actionSource.PSObject.Properties.Name }
$i = 0
foreach ($name in $names) {
  $i++
  Write-Progress -Activity 'Exporting run' -Status $name -PercentComplete (100 * $i / [Math]::Max(1, @($names).Count))
  $actions[$name] = Convert-Result $name ($actionSource.$name)
}
Write-Progress -Activity 'Exporting run' -Completed

$trigger = $null
if ($run.properties.trigger) { $trigger = Convert-Result ($run.properties.trigger.name) ($run.properties.trigger) }

$out = [ordered]@{
  format     = 'pfv-run/1'
  exportedAt = (Get-Date).ToUniversalTime().ToString('o')
  flow       = [ordered]@{ id = $FlowId; displayName = $run.properties.flow.properties.displayName }
  run        = [ordered]@{
    name      = $run.name
    status    = $run.properties.status
    startTime = $run.properties.startTime
    endTime   = $run.properties.endTime
    error     = $run.properties.error
  }
  trigger    = $trigger
  actions    = $actions
}

if (-not $OutFile) { $OutFile = "run-$RunId.json" }
$out | ConvertTo-Json -Depth 100 | Set-Content -Encoding utf8 -Path $OutFile
Write-Host "Saved $(@($names).Count) actions to $OutFile"
