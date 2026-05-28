import { Platform, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';

export const generateAndShareCajaPDF = async (resumen: any) => {
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

  const fechaAperturaObj = new Date(resumen.caja.fechaDeApertura);
  const now = new Date();
  
  // Format name: Cierre_y_apertura_DD_de_mes_del_YYYY_HH_MM.pdf
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const day = now.getDate().toString().padStart(2, '0');
  const monthName = meses[now.getMonth()];
  const year = now.getFullYear();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  const fileName = `Cierre_y_apertura_${day}_de_${monthName}_del_${year}_${hours}_${minutes}_${seconds}.pdf`;

  const insumosRows = resumen.insumos?.map((i: any) => `
    <tr style="page-break-inside: avoid;">
      <td>${i.nombreReal || i.nombreInsumo}</td>
      <td>${i.nombreProductoReal !== 'N/A' && i.nombreProductoReal ? i.nombreProductoReal : '-'}</td>
      <td class="text-center">${i.cantApertura || 0}</td>
      <td class="text-center">${i.cantDeCierre || 0}</td>
      <td class="text-center">${i.seUtilizaron || 0}</td>
      <td class="text-center">${i.ventasEnSistema || 0}</td>
      <td class="text-center ${i.diferencia < 0 ? 'text-red' : i.diferencia > 0 ? 'text-green' : ''}">
        ${i.diferencia > 0 ? '+' : ''}${i.diferencia}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="7" class="text-center">No hay insumos registrados</td></tr>';

  const formatTime12hPdf = (timeString: string) => {
    if (!timeString) return '-';
    try {
      const date = timeString.includes('T') ? new Date(timeString) : new Date(`1970-01-01T${timeString}Z`);
      let hours = date.getUTCHours();
      const minutes = date.getUTCMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; 
      return `${hours}:${minutes} ${ampm}`;
    } catch {
      return timeString;
    }
  };

  const summaryMap: Record<string, number> = {};
  resumen.notasAnalysis?.forEach((nota: any) => {
    nota.productosConNotas?.forEach((prod: any) => {
      prod.notas?.forEach((n: any) => {
        const name = n.name || n.nombre || n.Nombre;
        const qty = Number(n.cantidad) || 1;
        const price = Number(n.price || n.precio || n.Precio) || 0;
        const key = `${name}${price > 0 ? ` (+$${price})` : ''}`;
        summaryMap[key] = (summaryMap[key] || 0) + qty;
      });
    });
  });
  const summaryItems = Object.entries(summaryMap).sort((a, b) => b[1] - a[1]);
  const summaryHtml = summaryItems.length > 0 ? `
    <div style="background-color: #fff7ed; padding: 10px; border: 1px solid #ffedd5; border-radius: 6px; margin-bottom: 15px; page-break-inside: avoid;">
      <div style="font-size: 13px; font-weight: bold; color: #9a3412; margin-bottom: 5px;">Resumen Total de Modificadores</div>
      <ul style="margin: 0; padding-left: 20px; color: #c2410c; font-size: 12px;">
        ${summaryItems.map(([key, count]) => `<li><strong>${count}x</strong> ${key}</li>`).join('')}
      </ul>
    </div>
  ` : '';

  const notasRows = resumen.notasAnalysis?.map((nota: any) => {
    const notasList = nota.productosConNotas.map((prod: any) => {
      const notasItems = prod.notas.map((n: any) => `<li>${n.cantidad || 1}x ${n.name || n.nombre || n.Nombre} ${(n.price || n.precio || n.Precio) > 0 ? '(+$' + (n.price || n.precio || n.Precio) + ')' : ''}</li>`).join('');
      return `<strong>${prod.cantidad}x ${prod.producto}</strong><ul>${notasItems}</ul>`;
    }).join('');

    return `
      <tr style="page-break-inside: avoid;">
        <td class="text-center">${formatTime12hPdf(nota.hora) || '-'}</td>
        <td class="text-center"><strong>${nota.pedido || '-'}</strong></td>
        <td>${notasList}</td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="3" class="text-center">No se registraron notas o modificadores en este turno</td></tr>';

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${fileName}</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; margin: 0; padding: 20px; }
        .header { text-align: center; border-bottom: 2px solid #22c55e; padding-bottom: 10px; margin-bottom: 20px; page-break-after: avoid; }
        .header h1 { margin: 0; color: #22c55e; font-size: 24px; }
        .header p { margin: 5px 0; color: #666; font-size: 14px; }
        .section { margin-bottom: 25px; page-break-inside: avoid; }
        .section-title { background-color: #f3f4f6; padding: 8px 12px; font-size: 16px; font-weight: bold; border-left: 4px solid #22c55e; margin-bottom: 10px; page-break-after: avoid; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; page-break-inside: auto; }
        tr { page-break-inside: avoid; page-break-after: auto; }
        thead { display: table-header-group; }
        tfoot { display: table-footer-group; }
        th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; }
        th { background-color: #f9fafb; font-weight: bold; color: #4b5563; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .text-red { color: #dc2626; font-weight: bold; }
        .text-green { color: #16a34a; font-weight: bold; }
        .summary-box { display: flex; justify-content: space-between; background-color: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; page-break-inside: avoid; }
        .summary-item { text-align: center; flex: 1; }
        .summary-label { font-size: 12px; color: #64748b; text-transform: uppercase; }
        .summary-value { font-size: 18px; font-weight: bold; color: #0f172a; margin-top: 5px; }
        .observations { font-size: 14px; white-space: pre-wrap; page-break-inside: avoid; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>REPORTE DE CIERRE CAJA</h1>
        <p>Responsable: ${resumen.caja.nombre || 'No especificado'}</p>
        <p>Generado: ${now.toLocaleString('es-CO')}</p>
        <p>Desde: ${fechaAperturaObj.toLocaleString('es-CO')}</p>
        <p>Hasta: ${resumen.caja.fechaDeCierre ? new Date(resumen.caja.fechaDeCierre).toLocaleString('es-CO') : 'NO SE HA RENDIDO'}</p>
      </div>

      <div class="section">
        <div class="section-title">RESUMEN FINANCIERO</div>
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
          <div class="summary-box" style="flex: 1;">
            <div class="summary-item">
              <div class="summary-label">Efectivo Apertura</div>
              <div class="summary-value">${formatMoney(resumen.resumen.efectivoApertura || 0)}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Efectivo Cierre</div>
              <div class="summary-value">${formatMoney(resumen.resumen.efectivoCierre || 0)}</div>
            </div>
          </div>
        </div>

        <table>
          <tr>
            <th>Concepto</th>
            <th class="text-right">Monto</th>
          </tr>
          <tr>
            <td>Efectivo Físico Contado (Cierre)</td>
            <td class="text-right"><strong>${formatMoney(resumen.resumen.efectivoCierre || 0)}</strong></td>
          </tr>
          <tr>
            <td>Transferencias / Otros (Digital)</td>
            <td class="text-right">${formatMoney(resumen.resumen.transferenciasContadas ?? ((resumen.resumen.totalTransferencia || 0) + (resumen.resumen.totalNequi || 0)))}</td>
          </tr>
          <tr>
            <td>Total Ventas Sistema</td>
            <td class="text-right">${formatMoney(resumen.resumen.totalVentas || 0)}</td>
          </tr>
          <tr>
            <td>Dinero Retirado (Guardado)</td>
            <td class="text-right">${formatMoney(resumen.resumen.plataGuardada || 0)}</td>
          </tr>
          <tr style="background-color: #f8fafc;">
            <td><strong>Descuadre (Faltante / Sobrante)</strong></td>
            <td class="text-right ${resumen.resumen.valorFaltante > 0 ? 'text-red' : resumen.resumen.valorExcedente > 0 ? 'text-green' : ''}">
              <strong>${resumen.resumen.valorFaltante > 0 ? '-' + formatMoney(resumen.resumen.valorFaltante) : resumen.resumen.valorExcedente > 0 ? '+' + formatMoney(resumen.resumen.valorExcedente) : '$0'}</strong>
            </td>
          </tr>
        </table>
      </div>

      <div class="section">
        <div class="section-title">CONTROL DE INSUMOS FÍSICOS</div>
        <table>
          <thead>
            <tr>
              <th>Insumo</th>
              <th>Producto Destino</th>
              <th class="text-center">Apertura</th>
              <th class="text-center">Cierre</th>
              <th class="text-center">Gasto Físico</th>
              <th class="text-center">Gasto Sistema</th>
              <th class="text-center">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            ${insumosRows}
          </tbody>
        </table>
        <p style="font-size: 12px; color: #666; margin-top: 10px; page-break-inside: avoid;">
          * Diferencia Negativa (-): Faltan insumos físicamente (se entregó producto sin facturar).<br/>
          * Diferencia Positiva (+): Sobran insumos físicamente (se facturó de más o error de conteo).
        </p>
      </div>

      <div class="section">
        <div class="section-title">ANÁLISIS DE NOTAS Y MODIFICADORES</div>
        ${summaryHtml}
        <table>
          <thead>
            <tr>
              <th class="text-center" style="width: 15%">Hora</th>
              <th class="text-center" style="width: 25%">Pedido</th>
              <th>Productos y Notas</th>
            </tr>
          </thead>
          <tbody>
            ${notasRows}
          </tbody>
        </table>
      </div>

      ${resumen.caja.observaciones ? `
      <div class="section">
        <div class="section-title">OBSERVACIONES</div>
        <div class="observations">${resumen.caja.observaciones}</div>
      </div>
      ` : ''}

    </body>
    </html>
  `;

  try {
    if (Platform.OS === 'web') {
      // Para navegadores móviles y desktop (PWA)
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

    // Para app nativa (iOS / Android)
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
          return; // Usuario canceló
        }
      }

      try {
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        const newUri = await FileSystem.StorageAccessFramework.createFileAsync(directoryUri, fileName, 'application/pdf');
        await FileSystem.writeAsStringAsync(newUri, base64, { encoding: FileSystem.EncodingType.Base64 });
        
        // Mostrar mensaje de éxito
        Toast.show({ type: 'success', text1: 'Descarga Exitosa', text2: `Guardado en Descargas: ${fileName}` });

        try {
          // Obtener una URI de contenido segura usando getContentUriAsync para que Android permita a otras apps leer el archivo temporal
          const contentUri = await FileSystem.getContentUriAsync(uri);
          
          // Requerimos expo-intent-launcher localmente
          const IntentLauncher = require('expo-intent-launcher');
          
          // startActivityAsync fuerza la apertura directa con el visor de PDF
          // flags: 1 es CRUCIAL (FLAG_GRANT_READ_URI_PERMISSION) para que Google Drive no abra "sin contenido"
          await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
            data: contentUri,
            flags: 1,
            type: 'application/pdf',
          });
        } catch (openError: any) {
          console.log("Fallo al abrir:", openError);
          
          // Si el error es porque falta el módulo nativo, le avisamos al usuario
          if (openError?.message?.includes('native module') || openError?.message?.includes('ExpoIntentLauncher')) {
            Toast.show({ type: 'error', text1: 'Módulo Nativo Faltante', text2: 'Para que el PDF se abra automáticamente en Google Drive, detén tu servidor de Expo y ejecuta: npx expo run:android. Por ahora, usaremos el menú de compartir como respaldo.' });
          }

          // Fallback seguro al menú de compartir si falla la apertura directa
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri, {
              mimeType: 'application/pdf',
              dialogTitle: 'Abrir PDF',
            });
          }
        }

      } catch (error) {
        // Si el permiso expiró o la carpeta fue borrada, limpiamos para que vuelva a preguntar la próxima vez
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
          dialogTitle: 'Descargar Reporte de Cierre',
        });
      }
    }
  } catch (error) {
    console.error('Error al generar PDF:', error);
  }
};
