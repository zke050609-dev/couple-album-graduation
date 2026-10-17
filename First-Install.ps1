$ErrorActionPreference = 'Stop'
function Refresh-InstallPath {
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
}
function Install-AlbumPackage([string]$Package) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw '未找到 winget。请先通过 Microsoft Store 安装或更新“应用安装程序”，再重试。' }
  & winget install --id $Package --exact --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity
  if ($LASTEXITCODE -ne 0) { throw "安装 $Package 未成功，请检查网络或安装提示，然后重新运行首次安装。" }
  Refresh-InstallPath
}
Write-Host '首次安装：回忆相册' -ForegroundColor Cyan
Write-Host '基础相册支持账号、照片、视频、日记、时间轴和城市足迹。'
Write-Host '不安装 AI 时，基础相册可正常使用；AI 回忆文案和图像内容搜索功能受限，文字信息搜索仍可使用。'
Write-Host '基础环境需要 Node.js、Python/Pillow 和 FFmpeg；缺少的组件会联网下载，可能出现系统安装确认。'
if ((Read-Host '是否检查并安装基础环境？输入 Y 确认，其他输入退出') -notmatch '^(y|yes)$') { exit 0 }
try {
  Refresh-InstallPath
  $nodeReady = $false
  if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVersion = & node -p process.versions.node
    $nodeReady = $LASTEXITCODE -eq 0 -and ([version]$nodeVersion -ge [version]'24.0')
  }
  if (-not $nodeReady) { Install-AlbumPackage 'OpenJS.NodeJS.LTS' }
  & node -e "require('node:sqlite')"
  if ($LASTEXITCODE -ne 0) { throw 'Node.js 不支持内置 SQLite，请安装 Node.js 24 LTS 后重试。' }
  $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
  $pythonReady = $false
  if ($pythonCommand) {
    & $pythonCommand.Source -c 'import sys; sys.exit(0 if (3,10) <= sys.version_info[:2] <= (3,12) else 1)'
    $pythonReady = $LASTEXITCODE -eq 0
  }
  if (-not $pythonReady) {
    Install-AlbumPackage 'Python.Python.3.12'
    $pythonCandidates = @((Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'), 'C:\Program Files\Python312\python.exe')
    $pythonPath = $pythonCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $pythonPath) { throw 'Python 安装后未找到解释器，请重新打开首次安装后重试。' }
  } else { $pythonPath = $pythonCommand.Source }
  & $pythonPath -m pip install -r (Join-Path $PSScriptRoot 'server\pro\requirements.txt')
  if ($LASTEXITCODE -ne 0) { throw 'Pillow 安装失败，请检查网络后重试。' }
  if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { Install-AlbumPackage 'Gyan.FFmpeg' }
  $ffmpegCommand = Get-Command ffmpeg -ErrorAction Stop
  $nodeCommand = Get-Command node -ErrorAction Stop
  New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot 'runtime') | Out-Null
  @{python=$pythonPath;ffmpeg=$ffmpegCommand.Source;node=$nodeCommand.Source} | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot 'runtime\install-paths.json')
  $env:PYTHON_PATH = $pythonPath
  $env:FFMPEG_PATH = $ffmpegCommand.Source
  Write-Host '基础环境已准备完成。' -ForegroundColor Green
  Write-Host '可选 AI：将额外下载数 GB 依赖和模型，需要足够磁盘空间和稳定网络；CPU 推理可能较慢。'
  if ((Read-Host '是否安装 AI 回忆文案和图像搜索？输入 Y 确认，其他输入跳过') -match '^(y|yes)$') {
    try {
      & (Join-Path $PSScriptRoot 'Install-Image-Search.ps1')
      & (Join-Path $PSScriptRoot 'Install-Memory-Assistant.ps1')
      Write-Host 'AI 功能安装完成。' -ForegroundColor Green
    } catch {
      Write-Warning ('AI 安装未完成：' + $_.Exception.Message)
      Write-Host '基础相册仍可使用；AI 回忆文案和图像搜索功能受限。稍后可重新运行首次安装。'
    }
  } else { Write-Host '已跳过 AI 安装。基础相册可正常使用；AI 回忆文案和图像搜索功能受限。' }
  & (Join-Path $PSScriptRoot 'Start-Graduation.ps1')
} catch {
  Write-Host ('基础安装或启动未完成：' + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
