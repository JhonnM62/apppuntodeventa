# Script de Windows para iniciar compilacion en el VPS y descargar el APK

$VpsUser = "root"
$VpsIp = "100.42.185.2"
$VpsProjectDir = "/opt/build-farm/apppuntodeventa"
$LocalApkFolder = "C:\Users\Administrador\Documents\apk's"

# Asegurarse que la carpeta local exista
if (!(Test-Path -Path $LocalApkFolder)) {
    New-Item -ItemType Directory -Force -Path $LocalApkFolder
}

Write-Host "Iniciando compilacion remota en el VPS ($VpsIp)..." -ForegroundColor Cyan
# Ejecutamos el script remoto (asume que existe en el proyecto)
ssh ${VpsUser}@${VpsIp} "cd $VpsProjectDir && bash scripts/compile-vps.sh"

Write-Host "Buscando el nombre del APK generado..." -ForegroundColor Cyan
$ApkName = ssh ${VpsUser}@${VpsIp} "cd $VpsProjectDir && ls -t *.apk | head -n 1"

if ([string]::IsNullOrWhiteSpace($ApkName)) {
    Write-Host "ERROR: No se encontro ningun APK en el servidor." -ForegroundColor Red
    exit 1
}

Write-Host "Descargando el archivo $ApkName a tu computadora local..." -ForegroundColor Cyan
scp "${VpsUser}@${VpsIp}:${VpsProjectDir}/${ApkName}" "$LocalApkFolder\"

Write-Host "=============================================" -ForegroundColor Green
Write-Host "¡EXITO! Tu APK esta listo en:" -ForegroundColor Green
Write-Host "$LocalApkFolder\$ApkName" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
