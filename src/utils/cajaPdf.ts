import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import { getConfiguracionWhatsapp, uploadAndSendCajaWhatsapp } from './../services/configuracion';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatMoney = (amount: number) => `$${Number(amount || 0).toLocaleString('es-CO')}`;

const parseLocal = (iso: string | null | undefined) =>
  iso ? new Date(String(iso).replace(/Z$/i, '')) : null;

const formatTime12hPdf = (timeString: string) => {
  if (!timeString) return '-';
  try {
    const date = timeString.includes('T')
      ? new Date(timeString)
      : new Date(`1970-01-01T${timeString}Z`);
    let h = date.getUTCHours();
    const m = date.getUTCMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  } catch {
    return timeString;
  }
};

const buildFileName = (prefix: string) => {
  const now = new Date();
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const day   = now.getDate().toString().padStart(2, '0');
  const month = meses[now.getMonth()];
  const year  = now.getFullYear();
  const hh    = now.getHours().toString().padStart(2, '0');
  const mm    = now.getMinutes().toString().padStart(2, '0');
  const ss    = now.getSeconds().toString().padStart(2, '0');
  return `${prefix}_${day}_de_${month}_del_${year}_${hh}_${mm}_${ss}.pdf`;
};

// ─── HTML: GENERAL mode ────────────────────────────────────────────────────────

const buildGeneralHTML = (resumen: any, fileName: string): string => {
  const now = new Date();
  const fechaAperturaObj = parseLocal(resumen.caja.fechaDeApertura) || now;
  const fechaCierreObj   = parseLocal(resumen.caja.fechaDeCierre);

  const insumosRows = resumen.insumos?.map((i: any) => `
    <tr style="page-break-inside:avoid;background-color:${i.diferencia === 0 ? '#ecfdf5' : '#fef2f2'};border-left:4px solid ${i.diferencia === 0 ? '#10b981' : '#ef4444'};">
      <td style="font-weight:bold;color:#1f2937;">${i.nombreReal || i.nombreInsumo}</td>
      <td>${i.nombreProductoReal !== 'N/A' && i.nombreProductoReal ? i.nombreProductoReal : '-'}</td>
      <td class="text-center">${i.cantApertura ?? 0}</td>
      <td class="text-center">${i.cantDeCierre ?? 0}</td>
      <td class="text-center" style="font-weight:bold;color:#4b5563;">${i.seUtilizaron ?? 0}</td>
      <td class="text-center" style="font-weight:bold;color:#4b5563;">${i.ventasEnSistema ?? 0}</td>
      <td class="text-center" style="font-weight:900;color:${i.diferencia < 0 ? '#dc2626' : i.diferencia > 0 ? '#ea580c' : '#059669'};font-size:14px;">
        ${i.diferencia > 0 ? '+' : ''}${i.diferencia ?? 0}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="7" class="text-center">No hay insumos registrados</td></tr>';

  const summaryMap: Record<string, number> = {};
  resumen.notasAnalysis?.forEach((nota: any) => {
    nota.productosConNotas?.forEach((prod: any) => {
      prod.notas?.forEach((n: any) => {
        const name = n.name || n.nombre || n.Nombre;
        const qty  = Number(n.cantidad) || 1;
        const price = Number(n.price || n.precio || n.Precio) || 0;
        const key = `${name}${price > 0 ? ` (+$${price})` : ''}`;
        summaryMap[key] = (summaryMap[key] || 0) + qty;
      });
    });
  });
  const summaryItems = Object.entries(summaryMap).sort((a, b) => b[1] - a[1]);
  const summaryHtml = summaryItems.length > 0 ? `
    <div style="background-color:#fff7ed;padding:10px;border:1px solid #ffedd5;border-radius:6px;margin-bottom:15px;page-break-inside:avoid;">
      <div style="font-size:13px;font-weight:bold;color:#9a3412;margin-bottom:5px;">Resumen Total de Modificadores</div>
      <ul style="margin:0;padding-left:20px;color:#c2410c;font-size:12px;">
        ${summaryItems.map(([key, count]) => `<li><strong>${count}x</strong> ${key}</li>`).join('')}
      </ul>
    </div>
  ` : '';

  const notasRows = resumen.notasAnalysis?.map((nota: any) => {
    const notasList = nota.productosConNotas?.map((prod: any) => {
      const items = prod.notas.map((n: any) => `<li>${n.cantidad || 1}x ${n.name || n.nombre || n.Nombre} ${(n.price || n.precio || n.Precio) > 0 ? '(+$' + (n.price || n.precio || n.Precio) + ')' : ''}</li>`).join('');
      return `<strong>${prod.cantidad}x ${prod.producto}</strong><ul>${items}</ul>`;
    }).join('') || '';
    const extras = [];
    if (nota.cliente) extras.push(`<div style="color:#4f46e5;font-size:11px;margin-top:4px;">👤 Cliente: ${nota.cliente.nombre}</div>`);
    if (nota.descuento > 0) extras.push(`<div style="color:#ea580c;font-size:11px;margin-top:2px;">💸 Descuento: -$${nota.descuento} ${nota.porcentajeDeDescuento ? `(${nota.porcentajeDeDescuento}%)` : ''}</div>`);
    return `
      <tr style="page-break-inside:avoid;">
        <td class="text-center">${formatTime12hPdf(nota.hora) || '-'}</td>
        <td class="text-center"><strong>${nota.pedido || '-'}</strong></td>
        <td>${notasList}${extras.join('')}</td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="3" class="text-center">No se registraron notas o modificadores</td></tr>';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${fileName}</title>
<style>
  body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#333;margin:0;padding:20px;}
  .header{text-align:center;border-bottom:2px solid #22c55e;padding-bottom:10px;margin-bottom:20px;page-break-after:avoid;}
  .header h1{margin:0;color:#22c55e;font-size:24px;}
  .header p{margin:5px 0;color:#666;font-size:14px;}
  .section{margin-bottom:25px;page-break-inside:auto;}
  .section-title{background-color:#f3f4f6;padding:8px 12px;font-size:16px;font-weight:bold;border-left:4px solid #22c55e;margin-bottom:10px;page-break-after:avoid;}
  table{width:100%;border-collapse:collapse;font-size:12px;page-break-inside:auto;}
  tr{page-break-inside:avoid;page-break-after:auto;}
  thead{display:table-header-group;}
  tfoot{display:table-footer-group;}
  th,td{border:1px solid #e5e7eb;padding:8px;text-align:left;}
  th{background-color:#f9fafb;font-weight:bold;color:#4b5563;}
  .text-right{text-align:right;}
  .text-center{text-align:center;}
  .text-red{color:#dc2626;font-weight:bold;}
  .text-green{color:#16a34a;font-weight:bold;}
  .summary-box{display:flex;justify-content:space-between;background-color:#f8fafc;padding:15px;border-radius:8px;border:1px solid #e2e8f0;page-break-inside:avoid;}
  .summary-item{text-align:center;flex:1;}
  .summary-label{font-size:12px;color:#64748b;text-transform:uppercase;}
  .summary-value{font-size:18px;font-weight:bold;color:#0f172a;margin-top:5px;}
  .observations{font-size:14px;white-space:pre-wrap;page-break-inside:avoid;}
  @media print{.no-print{display:none;}}
</style>
</head>
<body>
  <div class="header">
    <h1>REPORTE DE CIERRE CAJA</h1>
    <p>Responsable: ${resumen.caja.nombre || 'No especificado'}</p>
    <p>Generado: ${now.toLocaleString('es-CO')}</p>
    <p>Desde: ${fechaAperturaObj.toLocaleString('es-CO')}</p>
    <p>Hasta: ${fechaCierreObj ? fechaCierreObj.toLocaleString('es-CO') : 'NO SE HA RENDIDO'}</p>
  </div>

  <div class="section">
    <div class="section-title">RESUMEN FINANCIERO</div>
    <div style="display:flex;gap:10px;margin-bottom:15px;">
      <div class="summary-box" style="flex:1;">
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
      <tr><th>Concepto</th><th class="text-right">Monto</th></tr>
      <tr><td>Efectivo Físico Contado (Cierre)</td><td class="text-right"><strong>${formatMoney(resumen.resumen.efectivoCierre || 0)}</strong></td></tr>
      <tr><td>Transferencias / Otros (Digital)</td><td class="text-right">${formatMoney(resumen.resumen.transferenciasContadas ?? ((resumen.resumen.totalTransferencia || 0) + (resumen.resumen.totalNequi || 0)))}</td></tr>
      <tr><td>Total Ventas Sistema</td><td class="text-right">${formatMoney(resumen.resumen.totalVentas || 0)}</td></tr>
      <tr><td>Total Efectivo Sistema</td><td class="text-right">${formatMoney((resumen.resumen.totalVentas || 0) - ((resumen.resumen.totalTransferencia || 0) + (resumen.resumen.totalNequi || 0)))}</td></tr>
      <tr><td style="padding-left:20px;font-size:11px;color:#555;">• Repartido en Efectivo</td><td class="text-right" style="font-size:11px;color:#555;">${formatMoney(resumen.resumen.efectivoRepartido || 0)}</td></tr>
      <tr><td style="padding-left:20px;font-size:11px;color:#555;">• Repartido en Transferencias</td><td class="text-right" style="font-size:11px;color:#555;">${formatMoney(resumen.resumen.transferenciasRepartidas || 0)}</td></tr>
      <tr><td>Dinero Retirado (Guardado)</td><td class="text-right">${formatMoney(resumen.resumen.plataGuardada || 0)}</td></tr>
      <tr style="background-color:#f8fafc;">
        <td><strong>Descuadre (Faltante / Sobrante)</strong></td>
        <td class="text-right ${resumen.resumen.valorFaltante > 0 ? 'text-red' : resumen.resumen.valorExcedente > 0 ? 'text-green' : ''}">
          <strong>${resumen.resumen.valorFaltante > 0 ? '-' + formatMoney(resumen.resumen.valorFaltante) : resumen.resumen.valorExcedente > 0 ? '+' + formatMoney(resumen.resumen.valorExcedente) : '$0'}</strong>
        </td>
      </tr>
    </table>
  </div>

  <div class="section" style="page-break-inside:avoid;">
    <div class="section-title">CANTIDAD DE PEDIDOS POR MEDIO DE PAGO</div>
    <table>
      <thead><tr><th>Medio de Pago</th><th class="text-center">Cantidad de Pedidos</th></tr></thead>
      <tbody>
        <tr><td>Efectivo</td><td class="text-center" style="font-weight:bold;color:#4b5563;">${resumen.resumen.cantEfectivo || 0}</td></tr>
        <tr><td>Transferencias (Incluye Nequi, Daviplata, etc.)</td><td class="text-center" style="font-weight:bold;color:#4b5563;">${(resumen.resumen.cantTransferencia || 0) + (resumen.resumen.cantNequi || 0)}</td></tr>
        <tr><td>Efectivo y Otros (Mixto)</td><td class="text-center" style="font-weight:bold;color:#4b5563;">${resumen.resumen.numeroOrdenesRepartidas || 0}</td></tr>
        <tr><td>Tarjeta</td><td class="text-center" style="font-weight:bold;color:#4b5563;">${resumen.resumen.cantTarjeta || 0}</td></tr>
        <tr style="background-color:#f8fafc;"><td><strong>TOTAL PEDIDOS COBRADOS</strong></td><td class="text-center" style="font-size:14px;font-weight:900;">${(resumen.resumen.cantEfectivo || 0) + (resumen.resumen.cantTransferencia || 0) + (resumen.resumen.cantNequi || 0) + (resumen.resumen.numeroOrdenesRepartidas || 0) + (resumen.resumen.cantTarjeta || 0)}</td></tr>
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">CONTROL DE INSUMOS FÍSICOS</div>
    <table>
      <thead>
        <tr>
          <th>Insumo</th><th>Producto Destino</th><th class="text-center">Apertura</th>
          <th class="text-center">Cierre</th><th class="text-center">Gasto Físico</th>
          <th class="text-center">Gasto Sistema</th><th class="text-center">Diferencia</th>
        </tr>
      </thead>
      <tbody>${insumosRows}</tbody>
    </table>
    <p style="font-size:12px;color:#666;margin-top:10px;page-break-inside:avoid;">
      * Diferencia Negativa (-): Faltan insumos físicamente.<br/>
      * Diferencia Positiva (+): Sobran insumos físicamente.
    </p>
  </div>

  <div class="section">
    <div class="section-title">ANÁLISIS DE NOTAS Y MODIFICADORES</div>
    ${summaryHtml}
    <table>
      <thead>
        <tr>
          <th class="text-center" style="width:15%">Hora</th>
          <th class="text-center" style="width:25%">Pedido</th>
          <th>Productos y Notas</th>
        </tr>
      </thead>
      <tbody>${notasRows}</tbody>
    </table>
  </div>

  ${resumen.caja.observaciones ? `
  <div class="section">
    <div class="section-title">OBSERVACIONES</div>
    <div class="observations">${resumen.caja.observaciones}</div>
  </div>` : ''}

  <div class="section" style="margin-top:30px;font-size:11px;color:#4b5563;background-color:#f8fafc;padding:15px;border-radius:8px;border:1px dashed #cbd5e1;page-break-inside:avoid;">
    <strong style="color:#1f2937;font-size:13px;">¿Cómo se calculan las operaciones?</strong><br/><br/>
    <b>1. Efectivo Esperado:</b> Efectivo Apertura + Ventas Efectivo Sistema - Dinero Guardado<br/><br/>
    <b>2. Descuadre:</b> Efectivo Físico Contado - Efectivo Esperado<br/>
    <i>* Negativo (Rojo): Falta dinero. * Positivo (Verde): Sobra dinero.</i>
  </div>
</body>
</html>`;
};

// ─── HTML: RESTAURANTE mode ────────────────────────────────────────────────────

const buildRestauranteHTML = (resumen: any, fileName: string): string => {
  const now = new Date();
  const fechaAperturaObj = parseLocal(resumen.caja.fechaDeApertura) || now;
  const fechaCierreObj   = parseLocal(resumen.caja.fechaDeCierre);

  const valorFaltante  = resumen.resumen?.valorFaltante || 0;
  const valorExcedente = resumen.resumen?.valorExcedente || 0;
  const efContado      = resumen.resumen?.efectivoCierre || 0;
  const transContadas  = resumen.resumen?.transferenciasContadas ?? ((resumen.resumen?.totalTransferencia || 0) + (resumen.resumen?.totalNequi || 0));
  const totalVentas    = resumen.resumen?.totalVentas || 0;
  const efectivoTotal  = resumen.resumen?.totalEfectivo || 0;
  const efectivoRepartido = resumen.resumen?.efectivoRepartido || 0;
  const transRepartidas   = resumen.resumen?.transferenciasRepartidas || 0;
  const numOrdenesRep     = resumen.resumen?.numeroOrdenesRepartidas || 0;
  const efApertura        = resumen.resumen?.efectivoApertura || 0;
  const cuadroCaja        = resumen.caja?.cuadroCaja || 'NO SE HA REVISADO';

  // insumos table rows
  const insumosRows = resumen.insumos?.map((i: any) => {
    const diferencia = i.diferencia ?? 0;
    const rowBg = diferencia < 0 ? '#fef2f2' : diferencia > 0 ? '#fff7ed' : '#f0fdf4';
    return `
    <tr style="background-color:${rowBg};">
      <td style="font-weight:bold;">${i.nombreReal || i.nombreInsumo || '-'}</td>
      <td style="font-size:11px;color:#555;">${i.nombreProductoReal && i.nombreProductoReal !== 'N/A' ? i.nombreProductoReal : '-'}</td>
      <td class="text-center">${i.unidadDeMedida || 'unidad'}</td>
      <td class="text-center">${i.cantApertura ?? 0}</td>
      <td class="text-center">${i.cantDeCierre ?? 0}</td>
      <td class="text-center" style="font-weight:bold;">${i.seUtilizaron ?? 0}</td>
      <td class="text-center" style="font-weight:bold;color:#4b5563;">${i.ventasEnSistema ?? 0}</td>
      <td class="text-center" style="font-weight:900;font-size:13px;color:${diferencia < 0 ? '#dc2626' : diferencia > 0 ? '#ea580c' : '#059669'};">
        ${diferencia > 0 ? '+' : ''}${diferencia}
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" class="text-center">No hay insumos registrados</td></tr>';

  // totales por insumo (apertura)
  const totalesRows = resumen.insumos?.map((i: any) => `
    <tr>
      <td>${i.nombreReal || i.nombreInsumo || '-'}</td>
      <td class="text-right">${i.cantApertura ?? 0}</td>
    </tr>
  `).join('') || '';

  // observaciones
  const obsText = (resumen.caja.observaciones || '').replace(/\n/g, ' ');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${fileName}</title>
<style>
  body{font-family:Arial,sans-serif;color:#111;margin:0;padding:16px;font-size:13px;}
  h1{text-align:center;font-size:20px;font-weight:bold;margin:0 0 8px;}
  .meta{font-size:12px;margin-bottom:6px;}
  .meta span{font-weight:bold;}
  .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:bold;margin-left:6px;}
  .badge-red{background:#dc2626;color:#fff;}
  .badge-green{background:#16a34a;color:#fff;}
  table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:12px;}
  th{background:#374151;color:#fff;padding:6px 8px;text-align:center;}
  td{border:1px solid #d1d5db;padding:5px 8px;}
  .text-center{text-align:center;}
  .text-right{text-align:right;}
  .section-title{background:#1f2937;color:#fff;padding:6px 10px;font-weight:bold;font-size:13px;margin:16px 0 6px;}
  .totales-aper{background:#16a34a;color:#fff;padding:6px 10px;font-weight:bold;font-size:13px;text-align:center;margin-bottom:6px;}
  .total-ventas{background:#374151;color:#fff;text-align:center;padding:8px;font-size:15px;font-weight:bold;margin-bottom:12px;}
  .ventas-table th{background:#6b7280;}
  .highlight-row td{background:#fca5a5;font-weight:bold;}
  .obs{font-size:12px;padding:8px;border:1px solid #e5e7eb;margin-top:8px;}
  @media print{.no-print{display:none;}}
</style>
</head>
<body>
  <h1>REPORTE DE CIERRE CAJA - HAMBURGUESAS</h1>
  <div class="meta">Nombre: <span>${resumen.caja.nombre || 'N/A'}</span></div>
  <div class="meta">Generado: <span>${now.toLocaleString('es-CO')}</span></div>
  <div class="meta">Desde: <span>${fechaAperturaObj.toLocaleString('es-CO')}</span></div>
  <div class="meta">Hasta: <span>${fechaCierreObj ? fechaCierreObj.toLocaleString('es-CO') : cuadroCaja}</span></div>
  <div class="meta">¿Cuadro Caja?: <span>${cuadroCaja}</span></div>
  <div class="meta">
    Valor Faltante: <span class="badge badge-red">$${valorFaltante.toLocaleString('es-CO')}</span>
    &nbsp;Calculado: <span class="badge ${valorFaltante > 0 ? 'badge-red' : 'badge-green'}">$${valorFaltante.toLocaleString('es-CO')}</span>
    &nbsp;&nbsp;
    Valor Excedente: <span class="badge badge-red">$${valorExcedente.toLocaleString('es-CO')}</span>
    &nbsp;Calculado: <span class="badge ${valorExcedente > 0 ? 'badge-green' : 'badge-red'}">$${valorExcedente.toLocaleString('es-CO')}</span>
  </div>
  <div class="meta">Efectivo Apertura: <span>${formatMoney(efApertura)}</span> | Cierre: <span>${formatMoney(efContado)}</span></div>

  <table>
    <thead>
      <tr>
        <th style="text-align:left;width:18%;">Nombre Insumo</th>
        <th style="text-align:left;width:34%;">Productos (Receta)</th>
        <th>U. Medida</th>
        <th>Cant apertura</th>
        <th>Cant de cierre</th>
        <th>Se utilizaron</th>
        <th>Venta Teórica</th>
        <th>Diferencia</th>
      </tr>
    </thead>
    <tbody>
      ${insumosRows}
    </tbody>
  </table>

  <div class="totales-aper">TOTALES POR INSUMO (Apertura):</div>
  <table style="width:60%;margin:0 auto 20px;">
    <thead>
      <tr>
        <th style="text-align:left;background:#6b7280;">Insumo</th>
        <th style="background:#6b7280;">Total Apertura</th>
      </tr>
    </thead>
    <tbody>
      ${totalesRows}
    </tbody>
  </table>

  <div style="background:#16a34a;color:#fff;padding:8px 12px;font-weight:bold;font-size:13px;margin-bottom:10px;">
    Total de efectivo en caja (Físico): ${formatMoney(efContado)}
  </div>

  <div class="total-ventas">TOTAL DE VENTAS SISTEMA: ${formatMoney(totalVentas)}</div>

  <table class="ventas-table" style="width:70%;margin:0 auto 16px;">
    <thead>
      <tr><th style="text-align:left;">CONCEPTO</th><th>VALOR</th></tr>
    </thead>
    <tbody>
      <tr><td>Efectivo Recibido:</td><td class="text-center">${formatMoney(efectivoTotal)}</td></tr>
      <tr><td>Transferencias:</td><td class="text-center">${formatMoney(transContadas)}</td></tr>
      <tr><td>Tarjeta:</td><td class="text-center">${formatMoney(resumen.resumen?.totalTarjeta || 0)}</td></tr>
      <tr><td>Número de Ordenes Repartidas:</td><td class="text-center">${numOrdenesRep}</td></tr>
      <tr><td>Efectivo Repartido:</td><td class="text-center">${formatMoney(efectivoRepartido)}</td></tr>
      <tr><td>Transferencias Repartidas:</td><td class="text-center">${formatMoney(transRepartidas)}</td></tr>
      <tr class="highlight-row">
        <td>Total efectivo caja - app:</td>
        <td class="text-center">${formatMoney(efContado)}</td>
      </tr>
      <tr><td>Total de Transferencias:</td><td class="text-center">${formatMoney(transContadas)}</td></tr>
    </tbody>
  </table>

  <div class="section-title">OBSERVACIONES:</div>
  <div class="obs">${obsText || 'Sin observaciones.'}</div>
</body>
</html>`;
};

// ─── Open HTML in browser window (web platform) ───────────────────────────────

const openHtmlInBrowserWindow = (html: string, fileName: string) => {
  // Open in a new window and trigger print dialog
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    // Fallback: create a blob URL and navigate to it
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName.replace('.pdf', '.html');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  // Wait for content to render then open print dialog
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 400);
  };
};

// ─── Main export ──────────────────────────────────────────────────────────────

export const generateAndShareCajaPDF = async (resumen: any, modoOperacion: 'GENERAL' | 'RESTAURANTE' = 'GENERAL') => {
  const fileName = buildFileName('Cierre_y_apertura');

  const htmlContent = modoOperacion === 'RESTAURANTE'
    ? buildRestauranteHTML(resumen, fileName)
    : buildGeneralHTML(resumen, fileName);

  // ── WEB platform ──────────────────────────────────────────────────────────
  if (Platform.OS === 'web') {
    openHtmlInBrowserWindow(htmlContent, fileName);
    return;
  }

  // ── NATIVE (Android / iOS) ────────────────────────────────────────────────
  let Print: any;
  let Sharing: any;
  let FileSystem: any;

  try {
    Print = require('expo-print');
    Sharing = require('expo-sharing');
    FileSystem = require('expo-file-system/legacy');
    if (!Print.printToFileAsync) throw new Error('Native missing');
  } catch (error) {
    Toast.show({ type: 'error', text1: 'Actualización Requerida', text2: 'El generador de PDFs (expo-print) requiere código nativo. Ejecuta: npx expo run:android' });
    return;
  }

  try {
    const { uri } = await Print.printToFileAsync({ html: htmlContent, base64: false });

    // ── WhatsApp integration ──────────────────────────────────────────────
    try {
      const resW = await getConfiguracionWhatsapp();
      const wConfig = resW.data || resW;
      if (wConfig?.enabled) {
        Toast.show({ type: 'info', text1: 'WhatsApp', text2: 'Enviando reporte...' });
        const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, '') || 'http://192.168.1.100:3000';
        const caption = `*REPORTE DE CAJA*\nFecha: ${parseLocal(resumen.caja.fechaDeCierre)?.toLocaleDateString() || new Date().toLocaleDateString()}\nEfectivo en Caja: ${formatMoney(resumen.caja.efectivoDeCierre)}\nVentas Totales: ${formatMoney(resumen.resumen?.totalVentas)}`;
        await uploadAndSendCajaWhatsapp(uri, fileName, caption, baseUrl);
        Toast.show({ type: 'success', text1: 'WhatsApp', text2: 'Reporte enviado con éxito' });
      }
    } catch (err) {
      console.error('Error enviando a WhatsApp:', err);
    }

    if (Platform.OS === 'android') {
      const SAF_KEY = '@saf_downloads_directory';
      let dirUri = await AsyncStorage.getItem(SAF_KEY);
      if (!dirUri) {
        Toast.show({ type: 'info', text1: 'Configurar Descargas', text2: 'Selecciona tu carpeta "Descargas". Solo lo harás una vez.' });
        const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (perm.granted) {
          dirUri = perm.directoryUri;
          await AsyncStorage.setItem(SAF_KEY, dirUri);
        } else return;
      }
      try {
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        const newUri = await FileSystem.StorageAccessFramework.createFileAsync(dirUri!, fileName, 'application/pdf');
        await FileSystem.writeAsStringAsync(newUri, base64, { encoding: FileSystem.EncodingType.Base64 });
        Toast.show({ type: 'success', text1: 'Descarga Exitosa', text2: `Guardado: ${fileName}` });
        try {
          const contentUri = await FileSystem.getContentUriAsync(uri);
          const IntentLauncher = require('expo-intent-launcher');
          await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: contentUri, flags: 1, type: 'application/pdf' });
        } catch (openError: any) {
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Abrir PDF' });
          }
        }
      } catch {
        await AsyncStorage.removeItem(SAF_KEY);
        Toast.show({ type: 'error', text1: 'Permiso Expirado', text2: 'Intenta de nuevo para reasignar la carpeta.' });
      }
    } else {
      const newUri = FileSystem.documentDirectory + fileName;
      await FileSystem.moveAsync({ from: uri, to: newUri });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(newUri, { mimeType: 'application/pdf', dialogTitle: 'Descargar Reporte de Cierre' });
      }
    }
  } catch (error) {
    console.error('Error al generar PDF:', error);
    Toast.show({ type: 'error', text1: 'Error', text2: 'No se pudo exportar el PDF' });
  }
};
