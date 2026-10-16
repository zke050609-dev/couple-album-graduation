$ErrorActionPreference='Stop'
$gradBundled=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$gradPython=if(Test-Path -LiteralPath $gradBundled){$gradBundled}else{(Get-Command python -ErrorAction Stop).Source}
$gradEnv=Join-Path $PSScriptRoot 'runtime\ai-env'
$gradModel=Join-Path $PSScriptRoot 'runtime\ai\models\chinese-clip-vit-large-336'
$gradWheels=Join-Path $PSScriptRoot 'runtime\ai\wheels'
if(-not(Test-Path -LiteralPath (Join-Path $gradEnv 'Scripts\python.exe'))){& $gradPython -m venv --system-site-packages $gradEnv;if($LASTEXITCODE -ne 0){throw '创建独立 Python 环境失败'}}
$gradAiPython=Join-Path $gradEnv 'Scripts\python.exe'
$gradVersion=(& $gradAiPython --version) -replace '^Python (\d+\.\d+).*','$1'
$gradNvidia=Get-Command nvidia-smi -ErrorAction SilentlyContinue
$gradTorchReady=& $gradAiPython -c 'import torch; print(torch.__version__)' 2>$null
if($LASTEXITCODE -eq 0 -and $gradTorchReady.StartsWith('2.10.')){
  Write-Output '使用现有 PyTorch 推理环境。'
}elseif($gradNvidia -and $gradVersion -eq '3.12'){
  & $gradPython (Join-Path $PSScriptRoot 'server\pro\download-torch.py') $gradWheels
  if($LASTEXITCODE -ne 0){throw 'GPU 安装包下载失败，重新运行可继续下载'}
  $gradWheel=Join-Path $gradWheels 'torch-2.10.0+cu128-cp312-cp312-win_amd64.whl'
  & $gradAiPython -m pip install --disable-pip-version-check --no-cache-dir $gradWheel
}else{
  & $gradAiPython -m pip install --disable-pip-version-check --no-cache-dir 'torch==2.10.0' --index-url https://download.pytorch.org/whl/cpu
}
if($LASTEXITCODE -ne 0){throw 'PyTorch 安装失败'}
& $gradAiPython -m pip install --disable-pip-version-check --no-cache-dir -r (Join-Path $PSScriptRoot 'server\pro\semantic-requirements.txt')
if($LASTEXITCODE -ne 0){throw '图像模型依赖安装失败'}
& $gradAiPython (Join-Path $PSScriptRoot 'server\pro\download-semantic-model.py') $gradModel
if($LASTEXITCODE -ne 0){throw '官方图像模型下载失败'}
& $gradAiPython -c 'import torch; print(torch.cuda.is_available()); print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else None)'
Write-Output '本地图像搜索模型安装完成。启动网站后，照片会自动建立内容索引。'
