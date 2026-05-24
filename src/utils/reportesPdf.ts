import { Platform, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const generateAndShareDineroGuardadoPDF = async (
  reporte: any,
  cajas: any[]
) => {
  let Print: any;
  let Sharing: any;
  let FileSystem: any;

  try {
    Print = require('expo-print');
    Sharing = require('expo-sharing');
    FileSystem = require('expo-file-system/legacy');
    if (!Print.printToFileAsync) throw new Error('Native missing');
  } catch (error) {
    Toast.show({ type: 'error', text1: 'Actualización Requerida', text2: 'El generador de PDFs (expo-print) contiene código nativo nuevo. Por favor, detén tu servidor de Expo y ejecuta: npx expo run:android para incrustar el nuevo módulo en tu teléfono.' });
    return;
  }

  const formatMoney = (amount: number) => `$${amount.toLocaleString('es-CO')}`;

  const now = new Date();
  
  // Format name: Reporte_Dinero_Guardado_DD_MM_YYYY_HH_MM_SS.pdf
  const day = now.getDate().toString().padStart(2, '0');
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const year = now.getFullYear();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  const fileName = `Reporte_Dinero_Guardado_${day}_${month}_${year}_${hours}_${minutes}_${seconds}.pdf`;

  // --- Calculations and HTML Rows Generation ---

  let totalPlataGuardada = 0;
  let totalResumen = 0;
  let totalEfectivoApp = 0;
  let totalDescuadre = 0;
  let totalTransferencias = 0;
  let totalFaltante = 0;
  let totalExcedente = 0;

  const cajasRows = cajas?.map((c: any) => {
    const pg = Number(c.plataGuardada || 0);
    totalPlataGuardada += pg;
    return `
      <tr>
        <td style="text-align: center;">${c.fechaDeApertura ? format(new Date(c.fechaDeApertura), "M/d/yyyy") : ''}</td>
        <td>${c.observaciones || ''}</td>
        <td style="text-align: center;">${formatMoney(pg)}</td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="3" style="text-align: center;">No hay cajas</td></tr>';

  const efectivoTransferenciasRows = cajas?.map((c: any) => {
    const resumen = Number(c.resumen || 0);
    totalResumen += resumen;

    let efectivoApp = 0;
    let transferenciasApp = 0;

    if (c.venta && Array.isArray(c.venta)) {
      c.venta.forEach((v: any) => {
        const totalFactura = Number(v.totalInput || 0);
        const medio = v.medioDePago || '';

        if (medio === 'EFECTIVO' || medio === 'PENDIENTE') {
          efectivoApp += totalFactura;
        } else if (medio === 'EFECTIVO Y OTROS') {
          efectivoApp += Number(v.efectivoRecibido || 0);
          transferenciasApp += Number(v.valorDeTransferencia || 0);
        } else {
          // Transferencias
          transferenciasApp += totalFactura;
        }
      });
    }

    const descuadre = resumen - efectivoApp;

    totalEfectivoApp += efectivoApp;
    totalDescuadre += descuadre;
    totalTransferencias += transferenciasApp;

    return `
      <tr>
        <td style="text-align: center;">${c.fechaDeApertura ? format(new Date(c.fechaDeApertura), "M/d/yyyy") : ''}</td>
        <td>${c.nombre || ''}</td>
        <td style="text-align: center;">${formatMoney(resumen)}</td>
        <td style="text-align: center;">${formatMoney(efectivoApp)}</td>
        <td style="text-align: center;">${formatMoney(descuadre)}</td>
        <td style="text-align: center;">${formatMoney(transferenciasApp)}</td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="6" style="text-align: center;">No hay cajas</td></tr>';

  const cuadreRows = cajas?.map((c: any) => {
    const faltante = Number(c.valorFaltante || 0);
    const excedente = Number(c.valorExcedente || 0);
    totalFaltante += faltante;
    totalExcedente += excedente;

    return `
      <tr>
        <td style="text-align: center;">${c.fechaDeApertura ? format(new Date(c.fechaDeApertura), "M/d/yyyy") : ''}</td>
        <td style="text-align: center;">${c.cuadroCaja || ''}</td>
        <td style="text-align: center;">${formatMoney(faltante)}</td>
        <td style="text-align: center;">${formatMoney(excedente)}</td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="4" style="text-align: center;">No hay cajas</td></tr>';

  const totalDescuadreOExcedente = totalExcedente - totalFaltante;

  // --- HTML Template ---
  
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${fileName}</title>
      <style>
        body { font-family: Arial, sans-serif; color: #000; margin: 0; padding: 20px; font-size: 11px; }
        h1 { text-align: center; font-size: 20px; margin-bottom: 20px; font-weight: bold; }
        h2 { text-align: center; font-size: 16px; margin-top: 30px; margin-bottom: 10px; font-weight: bold; }
        .header-info { margin-bottom: 20px; font-weight: bold; }
        .header-info div { margin-bottom: 4px; }
        
        table { width: 100%; border-collapse: collapse; margin-bottom: 15px; page-break-inside: auto; }
        tr { page-break-inside: avoid; page-break-after: auto; }
        thead { display: table-header-group; }
        th, td { border: 1px solid #000; padding: 6px; }
        th { text-align: center; font-weight: normal; }
        
        .font-bold { font-weight: bold; }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
      </style>
    </head>
    <body>
      <h1>REPORTE DE DINERO GUARDADO</h1>
      
      <div class="header-info">
        <div>Desde: ${reporte.desde ? format(new Date(reporte.desde), "M/d/yyyy") : ''}</div>
        <div>Hasta: ${reporte.hasta ? format(new Date(reporte.hasta), "M/d/yyyy") : ''}</div>
        <div>Generado: ${format(now, "M/d/yyyy h:mm:ss a")}</div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Observacion</th>
            <th>Precio</th>
          </tr>
        </thead>
        <tbody>
          ${cajasRows}
          <tr class="font-bold">
            <td colspan="2" class="text-right">TOTAL</td>
            <td class="text-center">${formatMoney(totalPlataGuardada)}</td>
          </tr>
        </tbody>
      </table>

      <h2>EFECTIVO Y TRANSFERENCIAS</h2>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Nombre</th>
            <th>Generado entre las fechas (Total de efectivo en caja)</th>
            <th>Total de efectivo en caja - app</th>
            <th>Descuadre entre Total de efectivo en caja y app</th>
            <th>Total de Transferencias:</th>
          </tr>
        </thead>
        <tbody>
          ${efectivoTransferenciasRows}
          <tr class="font-bold">
            <td colspan="2" class="text-right">TOTAL</td>
            <td class="text-center">${formatMoney(totalResumen)}</td>
            <td class="text-center">${formatMoney(totalEfectivoApp)}</td>
            <td class="text-center">${formatMoney(totalDescuadre)}</td>
            <td class="text-center">${formatMoney(totalTransferencias)}</td>
          </tr>
        </tbody>
      </table>

      <h2>CUADRE DE CAJA</h2>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>¿CUADRO O NO?</th>
            <th>Valor Faltante</th>
            <th>Valor Excedente</th>
          </tr>
        </thead>
        <tbody>
          ${cuadreRows}
          <tr class="font-bold">
            <td colspan="2" class="text-right">TOTAL</td>
            <td class="text-center">${formatMoney(totalFaltante)}</td>
            <td class="text-center">${formatMoney(totalExcedente)}</td>
          </tr>
          <tr class="font-bold">
            <td colspan="2" class="text-right">DESCUADRE O EXCEDENTE</td>
            <td colspan="2" class="text-center">${formatMoney(totalDescuadreOExcedente)}</td>
          </tr>
        </tbody>
      </table>
    </body>
    </html>
  `;

  // --- Download & Share Logic ---

  try {
    if (Platform.OS === 'web') {
      const { uri } = await Print.printToFileAsync({
        html: htmlContent,
        base64: true,
      });
      
      const link = document.createElement('a');
      link.href = uri;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    const { uri } = await Print.printToFileAsync({
      html: htmlContent,
      base64: false,
    });
    
    if (Platform.OS === 'android') {
      const SAF_DIRECTORY_KEY = '@saf_downloads_directory';
      let directoryUri = await AsyncStorage.getItem(SAF_DIRECTORY_KEY);

      if (!directoryUri) {
        Toast.show({ type: 'info', text1: 'Configurar Descargas', text2: 'Por seguridad de Android, por favor selecciona tu carpeta "Descargas" o "Downloads" en la siguiente pantalla. Solo tendrás que hacerlo esta vez y luego se guardarán automáticamente allí.' });
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          directoryUri = permissions.directoryUri;
          await AsyncStorage.setItem(SAF_DIRECTORY_KEY, directoryUri);
        } else {
          return;
        }
      }

      try {
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        const newUri = await FileSystem.StorageAccessFramework.createFileAsync(directoryUri, fileName, 'application/pdf');
        await FileSystem.writeAsStringAsync(newUri, base64, { encoding: FileSystem.EncodingType.Base64 });
        
        Toast.show({ type: 'success', text1: 'Descarga Exitosa', text2: `Guardado en Descargas: ${fileName}` });

        try {
          const contentUri = await FileSystem.getContentUriAsync(uri);
          
          const IntentLauncher = require('expo-intent-launcher');
          
          await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
            data: contentUri,
            flags: 1,
            type: 'application/pdf',
          });
        } catch (openError: any) {
          console.log("Fallo al abrir:", openError);
          
          if (openError?.message?.includes('native module') || openError?.message?.includes('ExpoIntentLauncher')) {
            Toast.show({ type: 'error', text1: 'Módulo Nativo Faltante', text2: 'Para que el PDF se abra automáticamente en Google Drive, detén tu servidor de Expo y ejecuta: npx expo run:android. Por ahora, usaremos el menú de compartir como respaldo.' });
          }

          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri, {
              mimeType: 'application/pdf',
              dialogTitle: 'Abrir PDF',
            });
          }
        }

      } catch (error) {
        await AsyncStorage.removeItem(SAF_DIRECTORY_KEY);
        Toast.show({ type: 'error', text1: 'Permiso Expirado', text2: 'El acceso a la carpeta de descargas expiró. Por favor, intenta de nuevo para reasignar la carpeta.' });
      }
    } else {
      const newUri = FileSystem.documentDirectory + fileName;
      await FileSystem.moveAsync({
        from: uri,
        to: newUri
      });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(newUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Descargar Reporte',
        });
      }
    }
  } catch (error) {
    console.error('Error al generar PDF:', error);
    Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo exportar el PDF' });
  }
};
