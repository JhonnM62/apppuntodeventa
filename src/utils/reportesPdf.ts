import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface VentaCaja {
  medioDePago: string;
  totalInput: number;
  efectivoRecibido: number;
  valorDeTransferencia: number;
}

interface CajaItem {
  IDcaja: string;
  nombre: string;
  fechaDeApertura: string;
  plataGuardada: number;
  cuadroCaja: string;
  observaciones: string;
  resumen: number;
  valorFaltante: number;
  valorExcedente: number;
  venta: VentaCaja[];
}

interface Reporte {
  FilterID: string;
  desde: string;
  hasta: string;
  tipoDeFiltro: string;
  totalDePlataGuardada: number;
}

interface DetalleDineroGuardado {
  reporte: Reporte;
  cajas: CajaItem[];
  plataGuardadaInicial: number;
  totalRetirado: number;
  sobranteActual: number;
  retiros: any[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fMoney = (amount: number): string => {
  const val = Number(amount) || 0;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(val);
};

/** Parsea una fecha ISO evitando el offset UTC que rota el día */
const parseLocal = (iso: string | null | undefined): Date => {
  if (!iso) return new Date();
  // Quita la Z final para tratar como local si viene con Z
  return new Date(String(iso).replace(/Z$/i, ''));
};

const formatDate = (iso: string | null | undefined): string => {
  const d = parseLocal(iso);
  if (isNaN(d.getTime())) return '';
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  return `${month}/${day}/${year}`;
};

/** Convierte \n en <br> y escapa caracteres HTML básicos */
const nl2br = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
};

// ─── Cálculo de efectivo y transferencias por caja ───────────────────────────
interface CalcEfectivo {
  efectivoApp: number;
  transferenciaApp: number;
}

const calcEfectivoYTransferencias = (ventas: VentaCaja[]): CalcEfectivo => {
  let efectivoApp = 0;
  let transferenciaApp = 0;

  (ventas || []).forEach((v) => {
    const total = Number(v.totalInput || 0);
    const medio = (v.medioDePago || '').toUpperCase();

    if (medio === 'EFECTIVO' || medio === 'PENDIENTE') {
      efectivoApp += total;
    } else if (medio === 'EFECTIVO Y OTROS') {
      efectivoApp += Number(v.efectivoRecibido || 0);
      transferenciaApp += Number(v.valorDeTransferencia || 0);
    } else {
      // TRANSFERENCIA, NEQUI, DAVIPLATA, TARJETA, etc.
      transferenciaApp += total;
    }
  });

  return { efectivoApp, transferenciaApp };
};

// ─── Generador principal ──────────────────────────────────────────────────────
export const generateAndShareDineroGuardadoPDF = async (detalle: DetalleDineroGuardado) => {
  let Print: any;
  let Sharing: any;
  let FileSystem: any;

  try {
    Print = require('expo-print');
    Sharing = require('expo-sharing');
    FileSystem = require('expo-file-system/legacy');
    if (!Print.printToFileAsync) throw new Error('Native missing');
  } catch {
    Toast.show({
      type: 'error',
      text1: 'Actualización Requerida',
      text2:
        'El generador de PDFs (expo-print) requiere código nativo. Ejecuta: npx expo run:android',
    });
    return;
  }

  const { reporte, cajas } = detalle;

  // Nombre de archivo
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const fileName = `Reporte_Dinero_Guardado_${pad(now.getDate())}_${pad(now.getMonth() + 1)}_${now.getFullYear()}_${pad(now.getHours())}_${pad(now.getMinutes())}_${pad(now.getSeconds())}.pdf`;

  // ── Sección 1: Dinero Guardado ────────────────────────────────────────────
  let totalPlataGuardada = 0;

  const cajasRows = (cajas || [])
    .map((c, idx) => {
      const pg = Number(c.plataGuardada || 0);
      totalPlataGuardada += pg;
      const obsHtml = nl2br(c.observaciones || '');

      return `
        <tr>
          <td style="text-align: center; font-weight: bold; vertical-align: top; white-space: nowrap;">
            ${idx + 1}. ${formatDate(c.fechaDeApertura)}
          </td>
          <td style="vertical-align: top; line-height: 1.6;">${obsHtml || '—'}</td>
          <td style="text-align: right; font-weight: bold; vertical-align: top; white-space: nowrap;">${fMoney(pg)}</td>
        </tr>`;
    })
    .join('');

  const cajasRowsFallback =
    cajasRows || '<tr><td colspan="3" style="text-align:center;">No hay cajas en este rango</td></tr>';

  // ── Sección 2: Efectivo y Transferencias ─────────────────────────────────
  let totalResumen = 0;
  let totalEfectivoApp = 0;
  let totalDescuadre = 0;
  let totalTransferencias = 0;

  const efectivoRows = (cajas || [])
    .map((c) => {
      const resumen = Number(c.resumen || 0);
      totalResumen += resumen;

      const { efectivoApp, transferenciaApp } = calcEfectivoYTransferencias(c.venta);
      const descuadre = resumen - efectivoApp;

      totalEfectivoApp += efectivoApp;
      totalDescuadre += descuadre;
      totalTransferencias += transferenciaApp;

      const descColor = descuadre < 0 ? '#dc2626' : descuadre > 0 ? '#ea580c' : '#000';

      return `
        <tr>
          <td style="text-align: center; white-space: nowrap;">${formatDate(c.fechaDeApertura)}</td>
          <td>${c.nombre || '—'}</td>
          <td style="text-align: right;">${fMoney(resumen)}</td>
          <td style="text-align: right;">${fMoney(efectivoApp)}</td>
          <td style="text-align: right; font-weight: bold; color: ${descColor};">${fMoney(descuadre)}</td>
          <td style="text-align: right;">${fMoney(transferenciaApp)}</td>
        </tr>`;
    })
    .join('');

  const efectivoRowsFallback =
    efectivoRows || '<tr><td colspan="6" style="text-align:center;">No hay cajas en este rango</td></tr>';

  // ── Sección 3: Cuadre de Caja ─────────────────────────────────────────────
  let totalFaltante = 0;
  let totalExcedente = 0;

  const cuadreRows = (cajas || [])
    .map((c) => {
      const faltante = Number(c.valorFaltante || 0);
      const excedente = Number(c.valorExcedente || 0);
      totalFaltante += faltante;
      totalExcedente += excedente;

      const cuadroLabel = c.cuadroCaja || '—';

      return `
        <tr>
          <td style="text-align: center; white-space: nowrap;">${formatDate(c.fechaDeApertura)}</td>
          <td style="text-align: center; font-weight: bold;">${cuadroLabel}</td>
          <td style="text-align: right; color: ${faltante > 0 ? '#dc2626' : '#000'};">${fMoney(faltante)}</td>
          <td style="text-align: right; color: ${excedente > 0 ? '#16a34a' : '#000'};">${fMoney(excedente)}</td>
        </tr>`;
    })
    .join('');

  const cuadreRowsFallback =
    cuadreRows || '<tr><td colspan="4" style="text-align:center;">No hay cajas en este rango</td></tr>';

  // Descuadre neto: excedente - faltante (negativo = pierde neto)
  const descuadreNeto = totalExcedente - totalFaltante;
  const descuadreColor = descuadreNeto < 0 ? '#dc2626' : descuadreNeto > 0 ? '#16a34a' : '#000';

  // ── HTML ──────────────────────────────────────────────────────────────────
  const generadoStr = `${now.toLocaleDateString('es-CO')} ${now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;

  const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fileName}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #000;
      margin: 0;
      padding: 24px 28px;
      font-size: 11px;
      line-height: 1.4;
    }

    /* ── Encabezado ── */
    h1 {
      text-align: center;
      font-size: 18px;
      font-weight: bold;
      letter-spacing: 1px;
      margin: 0 0 18px 0;
      text-transform: uppercase;
    }
    h2 {
      text-align: center;
      font-size: 15px;
      font-weight: bold;
      margin: 32px 0 12px 0;
      text-decoration: underline;
      text-transform: uppercase;
      page-break-before: auto;
    }
    .header-info { margin-bottom: 20px; }
    .header-info p { margin: 3px 0; font-weight: bold; }

    /* ── Tablas ── */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 0;
      page-break-inside: auto;
      font-size: 10.5px;
    }
    tr { page-break-inside: avoid; page-break-after: auto; }
    thead { display: table-header-group; }

    th, td {
      border: 1px solid #333;
      padding: 5px 7px;
      vertical-align: middle;
    }
    th {
      background-color: #f0f0f0;
      font-weight: bold;
      text-align: center;
    }

    /* Anchuras sección 1 */
    .col-fecha  { width: 14%; }
    .col-obs    { width: 68%; }
    .col-precio { width: 18%; }

    /* Anchuras sección 2 */
    .col2-fecha    { width: 10%; }
    .col2-nombre   { width: 16%; }
    .col2-generado { width: 18%; }
    .col2-efecapp  { width: 18%; }
    .col2-descuadre{ width: 20%; }
    .col2-transfer  { width: 18%; }

    /* Anchuras sección 3 */
    .col3-fecha    { width: 14%; }
    .col3-cuadro   { width: 36%; }
    .col3-faltante { width: 25%; }
    .col3-excedente{ width: 25%; }

    /* Filas de total */
    .tr-total td {
      font-weight: bold;
      background-color: #f7f7f7;
    }
    .tr-descuadre td {
      font-weight: bold;
      font-size: 12px;
      background-color: #e8f5e9;
    }
    .text-right  { text-align: right !important; }
    .text-center { text-align: center !important; }
    .text-left   { text-align: left !important; }
  </style>
</head>
<body>

  <h1>REPORTE DE DINERO GUARDADO</h1>

  <div class="header-info">
    <p>Desde: ${formatDate(reporte?.desde)}</p>
    <p>Hasta: ${formatDate(reporte?.hasta)}</p>
    <p>Generado: ${generadoStr}</p>
  </div>

  <!-- ══════════════════════════════════════════════
       SECCIÓN 1: Dinero Guardado
  ══════════════════════════════════════════════ -->
  <table>
    <thead>
      <tr>
        <th class="col-fecha">Fecha</th>
        <th class="col-obs">Observacion</th>
        <th class="col-precio">Precio</th>
      </tr>
    </thead>
    <tbody>
      ${cajasRowsFallback}
      <tr class="tr-total">
        <td colspan="2" class="text-right">TOTAL</td>
        <td class="text-right">${fMoney(totalPlataGuardada)}</td>
      </tr>
    </tbody>
  </table>

  <!-- ══════════════════════════════════════════════
       SECCIÓN 2: Efectivo y Transferencias
  ══════════════════════════════════════════════ -->
  <h2>EFECTIVO Y TRANSFERENCIAS</h2>
  <table>
    <thead>
      <tr>
        <th class="col2-fecha">Fecha</th>
        <th class="col2-nombre">Nombre</th>
        <th class="col2-generado">Generado entre las fechas<br>(Total de efectivo en caja)</th>
        <th class="col2-efecapp">Total de efectivo en caja - app</th>
        <th class="col2-descuadre">Descuadre entre Total de efectivo en caja y app</th>
        <th class="col2-transfer">Total de Transferencias</th>
      </tr>
    </thead>
    <tbody>
      ${efectivoRowsFallback}
      <tr class="tr-total">
        <td colspan="2" class="text-right">TOTAL</td>
        <td class="text-right">${fMoney(totalResumen)}</td>
        <td class="text-right">${fMoney(totalEfectivoApp)}</td>
        <td class="text-right" style="color: ${totalDescuadre < 0 ? '#dc2626' : totalDescuadre > 0 ? '#ea580c' : '#000'};">${fMoney(totalDescuadre)}</td>
        <td class="text-right">${fMoney(totalTransferencias)}</td>
      </tr>
    </tbody>
  </table>

  <!-- ══════════════════════════════════════════════
       SECCIÓN 3: Cuadre de Caja
  ══════════════════════════════════════════════ -->
  <h2>CUADRE DE CAJA</h2>
  <table>
    <thead>
      <tr>
        <th class="col3-fecha">Fecha</th>
        <th class="col3-cuadro">¿CUADRO O NO?</th>
        <th class="col3-faltante">Valor Faltante</th>
        <th class="col3-excedente">Valor Excedente</th>
      </tr>
    </thead>
    <tbody>
      ${cuadreRowsFallback}
      <tr class="tr-total">
        <td colspan="2" class="text-right">TOTAL</td>
        <td class="text-right" style="color: ${totalFaltante > 0 ? '#dc2626' : '#000'};">${fMoney(totalFaltante)}</td>
        <td class="text-right" style="color: ${totalExcedente > 0 ? '#16a34a' : '#000'};">${fMoney(totalExcedente)}</td>
      </tr>
      <tr class="tr-descuadre">
        <td colspan="2" class="text-right">DESCUADRE O EXCEDENTE</td>
        <td colspan="2" class="text-center" style="color: ${descuadreColor}; font-size: 13px;">
          ${fMoney(descuadreNeto)}
        </td>
      </tr>
    </tbody>
  </table>

</body>
</html>`;

  // ── Descarga y apertura (idéntico a cajaPdf.ts) ───────────────────────────
  try {
    // ── Web (PWA / Chrome) ──────────────────────────────────────────────────
    if (Platform.OS === 'web') {
      const { uri } = await Print.printToFileAsync({ html: htmlContent, base64: true });
      const link = document.createElement('a');
      link.href = uri;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // ── Nativo (Android / iOS) ──────────────────────────────────────────────
    const { uri } = await Print.printToFileAsync({ html: htmlContent, base64: false });

    if (Platform.OS === 'android') {
      const SAF_DIRECTORY_KEY = '@saf_downloads_directory';
      let directoryUri = await AsyncStorage.getItem(SAF_DIRECTORY_KEY);

      if (!directoryUri) {
        Toast.show({
          type: 'info',
          text1: 'Configurar Descargas',
          text2:
            'Por seguridad de Android, selecciona tu carpeta "Descargas". Solo tendrás que hacerlo esta vez.',
        });
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          directoryUri = permissions.directoryUri;
          await AsyncStorage.setItem(SAF_DIRECTORY_KEY, directoryUri);
        } else {
          return; // Usuario canceló
        }
      }

      try {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const newUri = await FileSystem.StorageAccessFramework.createFileAsync(
          directoryUri,
          fileName,
          'application/pdf'
        );
        await FileSystem.writeAsStringAsync(newUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        Toast.show({
          type: 'success',
          text1: 'Descarga Exitosa',
          text2: `Guardado en Descargas: ${fileName}`,
        });

        // Abrir automáticamente con el visor de PDF (Google Drive)
        try {
          const contentUri = await FileSystem.getContentUriAsync(uri);
          const IntentLauncher = require('expo-intent-launcher');
          await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
            data: contentUri,
            flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
            type: 'application/pdf',
          });
        } catch (openError: any) {
          console.log('[reportesPdf] Fallo al abrir:', openError);
          if (
            openError?.message?.includes('native module') ||
            openError?.message?.includes('ExpoIntentLauncher')
          ) {
            Toast.show({
              type: 'error',
              text1: 'Módulo Nativo Faltante',
              text2:
                'Ejecuta: npx expo run:android para que el PDF se abra automáticamente. Usando compartir como respaldo.',
            });
          }
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri, {
              mimeType: 'application/pdf',
              dialogTitle: 'Abrir PDF',
            });
          }
        }
      } catch {
        // Permiso SAF expirado → limpiar para que vuelva a pedir la carpeta
        await AsyncStorage.removeItem(SAF_DIRECTORY_KEY);
        Toast.show({
          type: 'error',
          text1: 'Permiso Expirado',
          text2:
            'El acceso a la carpeta de descargas expiró. Intenta de nuevo para reasignar la carpeta.',
        });
      }
    } else {
      // iOS
      const newUri = FileSystem.documentDirectory + fileName;
      await FileSystem.moveAsync({ from: uri, to: newUri });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(newUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Descargar Reporte de Dinero Guardado',
        });
      }
    }
  } catch (error) {
    console.error('[reportesPdf] Error al generar PDF:', error);
    Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo exportar el PDF' });
  }
};
