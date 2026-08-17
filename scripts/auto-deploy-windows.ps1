# Script de Windows para iniciar compilacion en el VPS y descargar el APK
param(
    [string]$Profile = "preview"
)

$VpsUser = "root"
$VpsIp = "100.42.185.2"
$VpsProjectDir = "/opt/build-farm/apppuntodeventa"
$LocalApkFolder = "C:\Users\Administrador\Documents\apk's"

# Asegurarse que la carpeta local exista
if (!(Test-Path -Path $LocalApkFolder)) {
    New-Item -ItemType Directory -Force -Path $LocalApkFolder
}

Write-Host "Sincronizando el codigo fuente en el VPS..." -ForegroundColor Cyan
# Traemos los cambios del repo y le damos permisos al script desde Windows directamente
ssh ${VpsUser}@${VpsIp} "cd $VpsProjectDir && git reset --hard && git pull && chmod +x scripts/compile-vps.sh"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: No se pudo sincronizar el codigo con GitHub en el VPS." -ForegroundColor Red
    exit 1
}

Write-Host "Iniciando compilacion remota en el VPS ($VpsIp) con perfil: $Profile..." -ForegroundColor Cyan
# Ejecutamos el script remoto pasándole el perfil con ServerAliveInterval para evitar desconexiones por inactividad
ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=120 ${VpsUser}@${VpsIp} "cd $VpsProjectDir && bash scripts/compile-vps.sh $Profile"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: La compilacion en el VPS fallo o el script no existe. Abortando proceso." -ForegroundColor Red
    exit 1
}

Write-Host "Descargando el APK a tu computadora local..." -ForegroundColor Cyan
scp "${VpsUser}@${VpsIp}:${VpsProjectDir}/*.apk" "$LocalApkFolder\"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: No se pudo descargar el APK del servidor." -ForegroundColor Red
    exit 1
}

$DownloadedApk = Get-ChildItem -Path $LocalApkFolder -Filter "*.apk" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

Write-Host "=============================================" -ForegroundColor Green
Write-Host "¡EXITO! Tu APK esta listo en:" -ForegroundColor Green
if ($DownloadedApk) {
    Write-Host "$LocalApkFolder\$($DownloadedApk.Name)" -ForegroundColor Green
} else {
    Write-Host "$LocalApkFolder\" -ForegroundColor Green
}
Write-Host "=============================================" -ForegroundColor Green
