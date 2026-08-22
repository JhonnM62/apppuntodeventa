export const generarLiquidacionHTML = (data: {
  empleadoNombre: string;
  empleadoCargo: string;
  cargo?: any;
  minutosGracia?: number;
  fechaInicio: string;
  fechaFin: string;
  turnos: any[];
  descuentos: any[];
  totalBruto: number;
  totalDescuentos: number;
  totalNeto: number;
  firmaAdmin?: string;
  firmaEmpleado?: string;
}) => {
  const { empleadoNombre, empleadoCargo, cargo, minutosGracia = 5, fechaInicio, fechaFin, turnos, descuentos, totalBruto, totalDescuentos, totalNeto, firmaAdmin, firmaEmpleado } = data;

  const formatDate = (d: string | Date) => new Date(d).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
  const formatMoney = (n: number) => `$${Number(n).toLocaleString('es-CO')}`;

  const formatTime = (d: string | Date) => {
    if (!d) return '---';
    return new Date(d).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' });
  };

  // Sort turnos: most recent first (descending by fecha)
  const turnosSorted = [...turnos].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  const formatDescanso = (t: any): string => {
    if (!t.inicioDescanso) return '<span style="color:#9ca3af">Sin registro</span>';
    const ini = new Date(t.inicioDescanso);
    const fin = t.finDescanso ? new Date(t.finDescanso) : null;
    const iniStr = ini.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' });
    if (!fin) return `${iniStr} → en curso`;
    const finStr = fin.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' });
    const durMin = Math.round((fin.getTime() - ini.getTime()) / 60000);
    const durStr = durMin >= 60 ? `${Math.floor(durMin/60)}h ${durMin%60 > 0 ? durMin%60+'min' : ''}`.trim() : `${durMin}min`;
    return `${iniStr} – ${finStr} <span style="color:#6b7280">(${durStr})</span>`;
  };

  const turnosRows = turnosSorted.map(t => `
    <tr>
      <td>${formatDate(t.fecha)}</td>
      <td>${formatTime(t.horaEntrada)}</td>
      <td>${formatTime(t.horaSalida)}</td>
      <td>${formatDescanso(t)}</td>
      <td>${t.ceno ? 'SÍ' : 'NO'}</td>
      <td style="text-align: right">${formatMoney(t.valorTurno)}</td>
    </tr>
  `).join('');

  // Sort descuentos: most recent first (descending by fecha)
  const descuentosSorted = [...descuentos].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  const CONCEPTOS_BONO = ['BONO', 'PREMIO', 'HORAS_EXTRAS'];
  
  const descuentosRows = descuentosSorted.map(d => {
    const isBono = CONCEPTOS_BONO.includes(d.concepto);
    return `
      <tr>
        <td>${formatDate(d.fecha)}</td>
        <td>${d.concepto}</td>
        <td>${d.descripcion || '---'}</td>
        <td style="text-align: right; color: ${isBono ? '#059669' : '#ef4444'};">
          ${isBono ? '+' : '-'} ${formatMoney(d.valor)}
        </td>
      </tr>
    `;
  }).join('');

  const totalBonos = descuentos
    .filter(d => CONCEPTOS_BONO.includes(d.concepto))
    .reduce((sum, d) => sum + Number(d.valor), 0);
    
  const brutoTurnos = totalBruto - totalBonos;

  const formatHourString = (str?: string) => {
    if (!str) return 'Descanso';
    const parts = str.split(':');
    if (parts.length !== 2) return str;
    let hour = parseInt(parts[0], 10);
    const m = parts[1];
    if (isNaN(hour)) return str;
    const suffix = hour >= 12 ? 'p. m.' : 'a. m.';
    const hour12 = hour % 12 || 12;
    return `${hour12.toString().padStart(2, '0')}:${m} ${suffix}`;
  };

  const calculateDuration = (entrada?: string, salida?: string) => {
    if (!entrada || !salida) return '---';
    const [hEntrada, mEntrada] = entrada.split(':').map(Number);
    const [hSalida, mSalida] = salida.split(':').map(Number);
    if (isNaN(hEntrada) || isNaN(mEntrada) || isNaN(hSalida) || isNaN(mSalida)) return '---';
    
    let totalMinutosEntrada = hEntrada * 60 + mEntrada;
    let totalMinutosSalida = hSalida * 60 + mSalida;
    
    if (totalMinutosSalida < totalMinutosEntrada) {
      totalMinutosSalida += 24 * 60;
    }
    
    const diff = totalMinutosSalida - totalMinutosEntrada;
    const hours = Math.floor(diff / 60);
    const minutes = diff % 60;
    
    if (minutes === 0) return `${hours} horas`;
    return `${hours} h ${minutes} m`;
  };

  const scheduleRows = `
    <tr>
      <td>Lunes</td>
      <td>${formatHourString(cargo?.horaEntradaLunes)}</td>
      <td>${formatHourString(cargo?.horaSalidaLunes)}</td>
      <td>${calculateDuration(cargo?.horaEntradaLunes, cargo?.horaSalidaLunes)}</td>
    </tr>
    <tr>
      <td>Martes</td>
      <td>${formatHourString(cargo?.horaEntradaMartes)}</td>
      <td>${formatHourString(cargo?.horaSalidaMartes)}</td>
      <td>${calculateDuration(cargo?.horaEntradaMartes, cargo?.horaSalidaMartes)}</td>
    </tr>
    <tr>
      <td>Miércoles</td>
      <td>${formatHourString(cargo?.horaEntradaMiercoles)}</td>
      <td>${formatHourString(cargo?.horaSalidaMiercoles)}</td>
      <td>${calculateDuration(cargo?.horaEntradaMiercoles, cargo?.horaSalidaMiercoles)}</td>
    </tr>
    <tr>
      <td>Jueves</td>
      <td>${formatHourString(cargo?.horaEntradaJueves)}</td>
      <td>${formatHourString(cargo?.horaSalidaJueves)}</td>
      <td>${calculateDuration(cargo?.horaEntradaJueves, cargo?.horaSalidaJueves)}</td>
    </tr>
    <tr>
      <td>Viernes</td>
      <td>${formatHourString(cargo?.horaEntradaViernes)}</td>
      <td>${formatHourString(cargo?.horaSalidaViernes)}</td>
      <td>${calculateDuration(cargo?.horaEntradaViernes, cargo?.horaSalidaViernes)}</td>
    </tr>
    <tr>
      <td>Sábado</td>
      <td>${formatHourString(cargo?.horaEntradaSabado)}</td>
      <td>${formatHourString(cargo?.horaSalidaSabado)}</td>
      <td>${calculateDuration(cargo?.horaEntradaSabado, cargo?.horaSalidaSabado)}</td>
    </tr>
    <tr>
      <td>Domingo</td>
      <td>${formatHourString(cargo?.horaEntradaDomingo)}</td>
      <td>${formatHourString(cargo?.horaSalidaDomingo)}</td>
      <td>${calculateDuration(cargo?.horaEntradaDomingo, cargo?.horaSalidaDomingo)}</td>
    </tr>
  `;

  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Comprobante de Pago - ${empleadoNombre}</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #333; }
        .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px; }
        .title { font-size: 24px; color: #1e3a8a; margin: 0; font-weight: bold; }
        .subtitle { font-size: 14px; color: #6b7280; margin-top: 5px; }
        .info-card { background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .info-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
        .info-label { font-weight: bold; color: #4b5563; }
        .info-value { color: #111827; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
        th { background-color: #eff6ff; color: #1e3a8a; text-align: left; padding: 10px; border-bottom: 2px solid #bfdbfe; }
        td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
        .totals { width: 50%; float: right; margin-bottom: 40px; }
        .total-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
        .total-row.neto { font-size: 18px; font-weight: bold; color: #059669; border-bottom: none; border-top: 2px solid #10b981; padding-top: 10px; }
        .signatures { clear: both; display: flex; justify-content: space-between; margin-top: 60px; }
        .signature-box { width: 45%; text-align: center; }
        .signature-img { max-width: 100%; height: 80px; object-fit: contain; margin-bottom: 10px; border-bottom: 1px solid #9ca3af; }
        .signature-line { border-top: 1px solid #9ca3af; padding-top: 5px; margin-top: 80px; }
        .no-signature { height: 80px; line-height: 80px; color: #9ca3af; font-style: italic; border-bottom: 1px solid #9ca3af; margin-bottom: 10px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1 class="title">Comprobante de Liquidación</h1>
        <p class="subtitle">Período: ${formatDate(fechaInicio)} al ${formatDate(fechaFin)}</p>
      </div>

      <div class="info-card">
        <div class="info-row">
          <span class="info-label">Empleado:</span>
          <span class="info-value">${empleadoNombre}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Cargo:</span>
          <span class="info-value">${empleadoCargo}</span>
        </div>
      </div>

      <h3 style="color: #374151; margin-bottom: 10px;">Detalle de Turnos (${turnos.length})</h3>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Entrada</th>
            <th>Salida</th>
            <th>Descanso</th>
            <th>Cena</th>
            <th style="text-align: right">Valor Pagado</th>
          </tr>
        </thead>
        <tbody>
          ${turnosRows || '<tr><td colspan="6" style="text-align: center; color: #6b7280;">No hay turnos registrados</td></tr>'}
        </tbody>
      </table>

      <h3 style="color: #374151; margin-bottom: 10px;">Detalle de Descuentos y Bonos (${descuentos.length})</h3>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Concepto</th>
            <th>Descripción</th>
            <th style="text-align: right">Valor</th>
          </tr>
        </thead>
        <tbody>
          ${descuentosRows || '<tr><td colspan="4" style="text-align: center; color: #6b7280;">No hay descuentos o bonos aplicados</td></tr>'}
        </tbody>
      </table>

      <div class="totals">
        <div class="total-row">
          <span class="info-label">Total Base (Turnos):</span>
          <span class="info-value">${formatMoney(brutoTurnos)}</span>
        </div>
        ${totalBonos > 0 ? `
        <div class="total-row">
          <span class="info-label" style="color: #059669;">Total Bonos/Sumas:</span>
          <span class="info-value" style="color: #059669;">+ ${formatMoney(totalBonos)}</span>
        </div>
        ` : ''}
        <div class="total-row">
          <span class="info-label">Total Bruto:</span>
          <span class="info-value">${formatMoney(totalBruto)}</span>
        </div>
        <div class="total-row">
          <span class="info-label" style="color: #ef4444;">Total Descuentos:</span>
          <span class="info-value" style="color: #ef4444;">- ${formatMoney(totalDescuentos)}</span>
        </div>
        <div class="total-row neto">
          <span>Total Neto a Pagar:</span>
          <span>${formatMoney(totalNeto)}</span>
        </div>
      </div>

      <div style="clear: both; padding-top: 20px;">
        <h3 style="color: #374151; margin-bottom: 10px;">Horario Establecido</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
          <thead>
            <tr>
              <th style="background-color: #f3f4f6; color: #374151;">Día</th>
              <th style="background-color: #f3f4f6; color: #374151;">Hora de Entrada</th>
              <th style="background-color: #f3f4f6; color: #374151;">Hora de Salida</th>
              <th style="background-color: #f3f4f6; color: #374151;">Duración</th>
            </tr>
          </thead>
          <tbody>
            ${scheduleRows}
          </tbody>
        </table>

        <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin-bottom: 30px; border-radius: 4px;">
          <h4 style="margin: 0 0 8px 0; color: #92400e;">Política de Asistencia y Descuentos</h4>
          <p style="margin: 0; font-size: 13px; color: #92400e; line-height: 1.5;">
            El tiempo de gracia permitido para el inicio de turno es de <strong>${minutosGracia} minutos</strong>. 
            Las llegadas posteriores al tiempo de gracia son penalizadas. La penalidad se calcula dividiendo el valor total del turno entre las horas esperadas, obteniendo el valor por minuto. Ese valor se multiplica por la cantidad de minutos de retraso que excedan el tiempo de gracia.
          </p>
        </div>
      </div>

      <div class="signatures">
        <div class="signature-box">
          ${firmaAdmin 
            ? `<img src="${firmaAdmin}" class="signature-img" />` 
            : `<div class="no-signature">Pendiente de firma</div>`
          }
          <div style="font-weight: bold; color: #374151;">Firma de Administración</div>
        </div>
        <div class="signature-box">
          ${firmaEmpleado 
            ? `<img src="${firmaEmpleado}" class="signature-img" />` 
            : `<div class="no-signature">Pendiente de firma</div>`
          }
          <div style="font-weight: bold; color: #374151;">Firma del Empleado</div>
          <div style="font-size: 12px; color: #6b7280; margin-top: 5px;">Acepta conforme la liquidación descrita</div>
        </div>
      </div>

      <script>
        document.addEventListener("DOMContentLoaded", function() {
          const images = document.querySelectorAll('.signature-img');
          images.forEach(function(img) {
            if (img.complete) {
              fixSignature(img);
            } else {
              img.addEventListener('load', function() {
                fixSignature(this);
              });
            }
          });

          function fixSignature(img) {
            // Si la firma es más alta que ancha, significa que se firmó en vertical
            if (img.naturalHeight > img.naturalWidth) {
              const canvas = document.createElement('canvas');
              canvas.width = img.naturalHeight;
              canvas.height = img.naturalWidth;
              const ctx = canvas.getContext('2d');
              
              // Rotar 90 grados para que quede horizontal (ajustando la orientación común)
              ctx.translate(canvas.width / 2, canvas.height / 2);
              ctx.rotate(90 * Math.PI / 180);
              ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
              
              img.src = canvas.toDataURL();
            }
          }
        });
      </script>
    </body>
    </html>
  `;
};
