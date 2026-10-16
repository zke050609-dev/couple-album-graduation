$ErrorActionPreference='Stop'
$memoryPython=Join-Path $PSScriptRoot 'runtime\ai-env\Scripts\python.exe'
if(-not(Test-Path -LiteralPath $memoryPython)){
  & (Join-Path $PSScriptRoot 'Install-Image-Search.ps1')
  if(-not(Test-Path -LiteralPath $memoryPython)){throw '请先运行“安装图像搜索.cmd”建立本地推理环境'}
}
& $memoryPython -c 'import torch, transformers; print("Using local inference environment", torch.__version__, transformers.__version__)'
if($LASTEXITCODE -ne 0){throw '推理环境不完整，请先运行“安装图像搜索.cmd”'}
& $memoryPython (Join-Path $PSScriptRoot 'server\pro\download-memory-model.py') (Join-Path $PSScriptRoot 'runtime\ai\models\qwen3-1.7b')
if($LASTEXITCODE -ne 0){throw '文字模型下载失败，重新运行可以继续下载'}
Write-Output '本地 AI 回忆助手安装完成。刷新网站，在城市相册中点击“AI 写回忆”。'
