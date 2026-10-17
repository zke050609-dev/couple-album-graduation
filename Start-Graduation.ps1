param([switch]$NoOpen)
$ErrorActionPreference='Stop'
$gradUrl='http://127.0.0.1:8088'
function Test-GradService {
  try { return (Invoke-RestMethod -Uri "$gradUrl/api/v2/health" -TimeoutSec 2).service -eq 'couple-album-graduation-v2' }
  catch { return $false }
}
if (-not (Test-GradService)) {
  $gradNodeCommand=Get-Command node -ErrorAction SilentlyContinue
  $gradNode=if($gradNodeCommand){$gradNodeCommand.Source}else{Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'}
  if(-not (Test-Path -LiteralPath $gradNode)){throw '请先安装 Node.js 22.13 或更新版本。'}
  $gradRuntime=Join-Path $PSScriptRoot 'runtime'
  New-Item -ItemType Directory -Force -Path $gradRuntime | Out-Null
  $gradProcess=Start-Process -FilePath $gradNode -ArgumentList 'start-preview.cjs' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $gradRuntime 'server.stdout.log') -RedirectStandardError (Join-Path $gradRuntime 'server.stderr.log') -PassThru
  $gradReady=$false
  for($gradAttempt=0;$gradAttempt -lt 30;$gradAttempt++){
    Start-Sleep -Milliseconds 250
    if(Test-GradService){$gradReady=$true;break}
    if($gradProcess.HasExited){break}
  }
  if(-not $gradReady){throw "启动失败，请查看 $gradRuntime\server.stderr.log；8088 端口可能已被其他程序使用。"}
  Set-Content -LiteralPath (Join-Path $gradRuntime 'server.pid') -Value $gradProcess.Id
}
Write-Output "回忆相册已就绪：$gradUrl"
$gradWifi=[System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() | Where-Object { $_.OperationalStatus -eq 'Up' -and $_.NetworkInterfaceType -eq 'Wireless80211' }
foreach($gradInterface in $gradWifi){
  foreach($gradAddress in $gradInterface.GetIPProperties().UnicastAddresses){
    if($gradAddress.Address.AddressFamily -eq 'InterNetwork' -and -not $gradAddress.Address.ToString().StartsWith('169.254.')){
      Write-Output ('手机（同 Wi-Fi）访问：http://'+$gradAddress.Address.ToString()+':8088/')
    }
  }
}
if(-not $NoOpen){Start-Process $gradUrl}
