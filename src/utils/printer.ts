import { Platform } from 'react-native';
import { getConfiguracion } from '../services/configuracion';
import { APP_CONFIG } from '../constants/app.config';

let BLEPrinter: any = null;
let currentConnectedMac: string | null = null;
try {
  const PrinterModule = require('react-native-thermal-receipt-printer-image-qr');
  BLEPrinter = PrinterModule.BLEPrinter;
} catch (error) {
  console.log('Bluetooth printer library not available');
}

export interface TicketProductModifier {
  name: string;
  price: number;
  quantity?: number;
}

export interface TicketProduct {
  cantidad: number;
  nombre: string;
  precioUnitario: number;
  subtotal: number;
  modifiers?: TicketProductModifier[];
  cantidadPreparada?: number;
}

export interface TicketData {
  orderId?: string;
  fecha: string;
  cliente?: string;
  productos: TicketProduct[];
  productosAnteriores?: TicketProduct[];
  total: number;
  efectivoRecibido?: number;
  devueltas?: number;
  metodoPago?: string;
  observaciones?: string;
  estado?: string;
  vendedor?: string;
  comercio?: {
    nombre?: string;
    nit?: string;
    direccion?: string;
    telefono?: string;
  };
}

// Helpers para alinear texto de forma manual (evita fallos de comandos ESC/POS en algunas impresoras)
const ESC_CMD = {
  ALIGN_CT: '\x1b\x61\x01',
  ALIGN_LT: '\x1b\x61\x00',
  TXT_NORMAL: '\x1b\x21\x00',
  TXT_2HEIGHT: '\x1b\x21\x10',
  TXT_2WIDTH: '\x1b\x21\x20',
  TXT_4SQUARE: '\x1b\x21\x30',
  TXT_BOLD_ON: '\x1b\x45\x01',
  TXT_BOLD_OFF: '\x1b\x45\x00',
};

const alignCenter = (text: string, width: number) => {
  const clean = text.trim();
  if (clean.length >= width) return clean.substring(0, width);
  const leftPad = Math.floor((width - clean.length) / 2);
  const rightPad = width - clean.length - leftPad;
  return ' '.repeat(leftPad) + clean + ' '.repeat(rightPad);
};

const alignLeft = (text: string, width: number) => {
  if (text.length >= width) return text.substring(0, width);
  return text + ' '.repeat(width - text.length);
};

const alignRight = (text: string, width: number) => {
  if (text.length >= width) return text.substring(0, width);
  return ' '.repeat(width - text.length) + text;
};

const padRight = (text: string, length: number) => {
  const str = String(text);
  if (str.length >= length) return str.substring(0, length);
  return str + ' '.repeat(length - str.length);
};

const padLeft = (text: string, length: number) => {
  const str = String(text);
  if (str.length >= length) return str.substring(0, length);
  return ' '.repeat(length - str.length) + str;
};

const formatCurrency = (amount: number) => {
  return '$' + amount.toLocaleString('es-CO');
};

// Limpia caracteres especiales, acentos y espacios invisibles que causan letras chinas en la impresora
const cleanText = (text: string) => {
  if (!text) return '';
  // Elimina acentos
  let cleaned = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Elimina caracteres de puntuación iniciales que no existen en ASCII básico
  cleaned = cleaned.replace(/[¡¿]/g, '');
  // Reemplaza espacios de no separación (causantes de a. m./p. m. con símbolos chinos) por espacios normales
  cleaned = cleaned.replace(/[\u202F\u00A0]/g, ' ');
  // Remueve cualquier otro carácter que no sea ASCII estándar
  cleaned = cleaned.replace(/[^\x20-\x7E]/g, '');
  return cleaned;
};

// Corta el texto en varias líneas sin romper las palabras
const wordWrap = (text: string, maxLen: number): string[] => {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    if ((currentLine + word).length > maxLen) {
      if (currentLine.length > 0) {
        lines.push(currentLine.trim());
        currentLine = word + ' ';
      } else {
        // La palabra es más larga que la línea, forzamos el corte
        lines.push(word.substring(0, maxLen));
        currentLine = word.substring(maxLen) + ' ';
      }
    } else {
      currentLine += word + ' ';
    }
  }
  if (currentLine.trim().length > 0) {
    lines.push(currentLine.trim());
  }
  return lines;
};

export const generateTicketPayload = (data: TicketData, paperSize: 58 | 80): string => {
  const width = paperSize === 58 ? 32 : 48;
  const separator = '-'.repeat(width);
  const boldSeparator = '='.repeat(width);

  let payload = '';

  // HEADER
  if (data.comercio) {
    const { nombre, nit, direccion, telefono } = data.comercio;
    payload += ESC_CMD.ALIGN_CT;
    payload += ESC_CMD.TXT_BOLD_ON;
    payload += alignCenter(cleanText(nombre || APP_CONFIG.ticketName), width) + '\n';
    payload += ESC_CMD.TXT_NORMAL;
    payload += ESC_CMD.TXT_BOLD_OFF;
    if (nit) payload += alignCenter(cleanText(`NIT: ${nit}`), width) + '\n';
    if (direccion) payload += alignCenter(cleanText(direccion), width) + '\n';
    if (telefono) payload += alignCenter(cleanText(`Tel: ${telefono}`), width) + '\n';
    payload += alignCenter(cleanText('DOCUMENTO EQUIVALENTE / REMISION'), width) + '\n';
  } else {
    payload += ESC_CMD.ALIGN_CT;
    payload += ESC_CMD.TXT_BOLD_ON;
    payload += alignCenter(cleanText(APP_CONFIG.ticketName), width) + '\n';
    payload += ESC_CMD.TXT_NORMAL;
    payload += ESC_CMD.TXT_BOLD_OFF;
    payload += alignCenter(cleanText('SISTEMA POS'), width) + '\n';
  }
  payload += ESC_CMD.ALIGN_LT;
  payload += separator + '\n';

  // INFO DE ORDEN
  if (data.orderId) {
    payload += ESC_CMD.ALIGN_CT;
    payload += ESC_CMD.TXT_4SQUARE;
    payload += ESC_CMD.TXT_BOLD_ON;
    // Eliminamos la palabra "PEDIDO:" ya que a veces viene incluida en el orderId (ej: "pedido-1...")
    // o es redundante para el cliente.
    payload += cleanText(data.orderId.toUpperCase()) + '\n';
    payload += ESC_CMD.TXT_NORMAL;
    payload += ESC_CMD.TXT_BOLD_OFF;
    payload += ESC_CMD.ALIGN_LT;
    payload += separator + '\n';
  }
  
  payload += alignLeft(cleanText(`Fecha: ${data.fecha}`), width) + '\n';
  if (data.cliente) payload += alignLeft(cleanText(`Cliente: ${data.cliente}`), width) + '\n';
  if (data.estado) payload += alignLeft(cleanText(`Estado: ${data.estado}`), width) + '\n';
  if (data.vendedor) payload += alignLeft(cleanText(`Atendió: ${data.vendedor}`), width) + '\n';
  payload += separator + '\n';

  // ENCABEZADOS DE PRODUCTOS
  // 58mm: 6 (CANT) + 16 (PRODUCTO) + 10 (TOTAL) = 32
  // 80mm: 6 (CANT) + 30 (PRODUCTO) + 12 (TOTAL) = 48
  const qtyW = paperSize === 58 ? 6 : 6;
  const priceW = paperSize === 58 ? 10 : 12;
  const nameW = width - qtyW - priceW;

  payload += alignLeft(
    padRight('CANT.', qtyW) + 
    padRight('PRODUCTO', nameW) + 
    padLeft('TOTAL', priceW)
  , width) + '\n';
  payload += separator + '\n';

  // PRODUCTOS MULTILÍNEA
  data.productos.forEach((p, index) => {
    const cleanName = cleanText(p.nombre);
    const nameLines = wordWrap(cleanName, nameW - 1); // -1 para un espacio de margen
    
    const qtyStr = padRight(p.cantidad.toString(), qtyW);
    const totalStr = padLeft(formatCurrency(p.subtotal), priceW);
    const emptyQty = padRight('', qtyW);
    const emptyTotal = padLeft('', priceW);
    
    if (nameLines.length === 0) return;

    if (nameLines.length === 1) {
      payload += alignLeft(`${qtyStr}${padRight(nameLines[0], nameW)}${totalStr}`, width) + '\n';
    } else {
      // Primera línea: Cantidad y primera parte del nombre
      payload += alignLeft(`${qtyStr}${padRight(nameLines[0], nameW)}${emptyTotal}`, width) + '\n';
      
      // Líneas intermedias
      for (let i = 1; i < nameLines.length - 1; i++) {
        payload += alignLeft(`${emptyQty}${padRight(nameLines[i], nameW)}${emptyTotal}`, width) + '\n';
      }
      
      // Última línea: Resto del nombre y el Total
      payload += alignLeft(`${emptyQty}${padRight(nameLines[nameLines.length - 1], nameW)}${totalStr}`, width) + '\n';
    }

    // Modificadores (Adicionales/Descuentos)
    if (p.modifiers && p.modifiers.length > 0) {
      p.modifiers.forEach(mod => {
        const modQty = mod.quantity || 1;
        const modName = cleanText(`  * ${modQty}x ${mod.name}`);
        const modNameLines = wordWrap(modName, nameW - 1);
        const totalModPrice = mod.price * modQty;
        const modPriceStr = totalModPrice !== 0 ? formatCurrency(totalModPrice) : 'Gratis';
        const formattedPrice = totalModPrice > 0 ? `+${modPriceStr}` : modPriceStr;
        const totalModStr = padLeft(formattedPrice, priceW);
        
        if (modNameLines.length === 1) {
          payload += alignLeft(`${emptyQty}${padRight(modNameLines[0], nameW)}${totalModStr}`, width) + '\n';
        } else {
          payload += alignLeft(`${emptyQty}${padRight(modNameLines[0], nameW)}${emptyTotal}`, width) + '\n';
          for (let i = 1; i < modNameLines.length - 1; i++) {
            payload += alignLeft(`${emptyQty}${padRight(modNameLines[i], nameW)}${emptyTotal}`, width) + '\n';
          }
          payload += alignLeft(`${emptyQty}${padRight(modNameLines[modNameLines.length - 1], nameW)}${totalModStr}`, width) + '\n';
        }
      });
    }

    // Separador entre productos
    if (index < data.productos.length - 1) {
      payload += '='.repeat(width) + '\n';
    }
  });

  payload += boldSeparator + '\n';

  // TOTALES
  payload += alignRight(cleanText(`TOTAL A PAGAR: ${formatCurrency(data.total)}`), width) + '\n';
  
  if (data.metodoPago) {
    payload += alignRight(cleanText(`Medio de Pago: ${data.metodoPago}`), width) + '\n';
  }
  if (data.efectivoRecibido && data.efectivoRecibido > 0) {
    payload += alignRight(cleanText(`Recibido: ${formatCurrency(data.efectivoRecibido)}`), width) + '\n';
    if (data.devueltas !== undefined) {
      payload += alignRight(cleanText(`Cambio: ${formatCurrency(data.devueltas)}`), width) + '\n';
    }
  }

  // FOOTER
  payload += separator + '\n';
  if (data.observaciones) {
    payload += alignLeft(cleanText(`Notas: ${data.observaciones}`), width) + '\n';
    payload += separator + '\n';
  }
  
  payload += alignCenter(cleanText('Gracias por tu compra!'), width) + '\n';
  payload += alignCenter(cleanText('Vuelve pronto'), width) + '\n';
  
  // ESPACIO FINAL PARA CORTE (Súper importante en impresoras POS)
  payload += '\n\n\n\n';

  return payload;
};

export const generateComandaPayload = (data: TicketData, paperSize: 58 | 80): string => {
  const width = paperSize === 58 ? 32 : 48;
  const separator = '-'.repeat(width);

  let payload = '';

  // HEADER (TICKET DE PREPARACIÓN)
  payload += ESC_CMD.ALIGN_CT;
  payload += ESC_CMD.TXT_4SQUARE;
  payload += ESC_CMD.TXT_BOLD_ON;
  payload += cleanText('NUEVA ORDEN (COCINA)') + '\n';
  payload += ESC_CMD.TXT_NORMAL;
  payload += ESC_CMD.TXT_BOLD_OFF;
  payload += ESC_CMD.ALIGN_LT;
  payload += separator + '\n';

  // INFO DE ORDEN
  if (data.orderId) {
    payload += ESC_CMD.ALIGN_CT;
    payload += ESC_CMD.TXT_4SQUARE;
    payload += ESC_CMD.TXT_BOLD_ON;
    payload += cleanText(data.orderId.toUpperCase()) + '\n';
    payload += ESC_CMD.TXT_NORMAL;
    payload += ESC_CMD.TXT_BOLD_OFF;
    payload += ESC_CMD.ALIGN_LT;
    payload += separator + '\n';
  }
  
  payload += alignLeft(cleanText(`Fecha: ${data.fecha}`), width) + '\n';
  if (data.cliente) payload += alignLeft(cleanText(`Cliente: ${data.cliente}`), width) + '\n';
  if (data.vendedor) payload += alignLeft(cleanText(`Atendió: ${data.vendedor}`), width) + '\n';
  payload += separator + '\n';

  // PRODUCTOS (SIN PRECIOS)
  const qtyW = 6;
  const nameW = width - qtyW;

  payload += alignLeft(
    padRight('CANT.', qtyW) + 
    padRight('PRODUCTO', nameW)
  , width) + '\n';
  payload += separator + '\n';

  data.productos.forEach((p, index) => {
    const cleanName = cleanText(p.nombre);
    const nameLines = wordWrap(cleanName, nameW - 1);
    
    const qtyStr = padRight(p.cantidad.toString(), qtyW);
    const emptyQty = padRight('', qtyW);
    
    if (nameLines.length === 0) return;

    payload += ESC_CMD.TXT_2HEIGHT + ESC_CMD.TXT_BOLD_ON;
    if (nameLines.length === 1) {
      payload += alignLeft(`${qtyStr}${nameLines[0]}`, width) + '\n';
    } else {
      payload += alignLeft(`${qtyStr}${nameLines[0]}`, width) + '\n';
      for (let i = 1; i < nameLines.length; i++) {
        payload += alignLeft(`${emptyQty}${nameLines[i]}`, width) + '\n';
      }
    }
    payload += ESC_CMD.TXT_NORMAL + ESC_CMD.TXT_BOLD_OFF;

    if (p.modifiers && p.modifiers.length > 0) {
      p.modifiers.forEach(mod => {
        const modQty = mod.quantity || 1;
        const modName = cleanText(`  * ${modQty}x ${mod.name}`);
        const modNameLines = wordWrap(modName, nameW - 1);
        
        if (modNameLines.length === 1) {
          payload += alignLeft(`${emptyQty}${modNameLines[0]}`, width) + '\n';
        } else {
          payload += alignLeft(`${emptyQty}${modNameLines[0]}`, width) + '\n';
          for (let i = 1; i < modNameLines.length; i++) {
            payload += alignLeft(`${emptyQty}${modNameLines[i]}`, width) + '\n';
          }
        }
      });
    }

    if (p.cantidadPreparada && p.cantidadPreparada > 0) {
      const faltan = p.cantidad - p.cantidadPreparada;
      let infoText = '';
      if (faltan > 0) {
        infoText = `  * ${p.cantidadPreparada} PREPARADAS, FALTA(N) ${faltan}`;
      } else {
        infoText = `  * TODAS PREPARADAS (${p.cantidadPreparada})`;
      }
      
      const infoStr = cleanText(infoText);
      const infoLines = wordWrap(infoStr, nameW - 1);
      if (infoLines.length === 1) {
        payload += alignLeft(`${emptyQty}${infoLines[0]}`, width) + '\n';
      } else {
        payload += alignLeft(`${emptyQty}${infoLines[0]}`, width) + '\n';
        for (let i = 1; i < infoLines.length; i++) {
          payload += alignLeft(`${emptyQty}${infoLines[i]}`, width) + '\n';
        }
      }
    }

    if (index < data.productos.length - 1) {
      payload += '\n' + separator + '\n';
    }
  });

  if (data.productosAnteriores && data.productosAnteriores.length > 0) {
    payload += '\n' + separator + '\n';
    payload += ESC_CMD.ALIGN_CT;
    payload += ESC_CMD.TXT_BOLD_ON;
    payload += 'ANTERIORES / ENTREGADOS\n';
    payload += ESC_CMD.TXT_BOLD_OFF;
    payload += ESC_CMD.ALIGN_LT;
    payload += separator + '\n';
    payload += alignLeft(
      padRight('CANT.', qtyW) + 
      padRight('PRODUCTO', nameW)
    , width) + '\n';
    payload += separator + '\n';

    data.productosAnteriores.forEach((p, index) => {
      const cleanName = cleanText(p.nombre);
      const nameLines = wordWrap(cleanName, nameW - 1);
      
      const qtyStr = padRight(p.cantidad.toString(), qtyW);
      const emptyQty = padRight('', qtyW);
      
      if (nameLines.length === 0) return;

      if (nameLines.length === 1) {
        payload += alignLeft(`${qtyStr}${nameLines[0]}`, width) + '\n';
      } else {
        payload += alignLeft(`${qtyStr}${nameLines[0]}`, width) + '\n';
        for (let i = 1; i < nameLines.length; i++) {
          payload += alignLeft(`${emptyQty}${nameLines[i]}`, width) + '\n';
        }
      }

      if (p.modifiers && p.modifiers.length > 0) {
        p.modifiers.forEach(mod => {
          const modQty = mod.quantity || 1;
          const modName = cleanText(`  * ${modQty}x ${mod.name}`);
          const modNameLines = wordWrap(modName, nameW - 1);
          
          if (modNameLines.length === 1) {
            payload += alignLeft(`${emptyQty}${modNameLines[0]}`, width) + '\n';
          } else {
            payload += alignLeft(`${emptyQty}${modNameLines[0]}`, width) + '\n';
            for (let i = 1; i < modNameLines.length; i++) {
              payload += alignLeft(`${emptyQty}${modNameLines[i]}`, width) + '\n';
            }
          }
        });
      }

      if (index < data.productosAnteriores!.length - 1) {
        payload += separator + '\n';
      }
    });
  }

  payload += separator + '\n';
  if (data.observaciones) {
    payload += ESC_CMD.TXT_BOLD_ON;
    payload += alignLeft(cleanText(`NOTAS: ${data.observaciones}`), width) + '\n';
    payload += ESC_CMD.TXT_BOLD_OFF;
    payload += separator + '\n';
  }
  
  payload += '\n\n\n\n';

  return payload;
};

export const executePrint = async (
  ticketData: TicketData,
  paperSize: 58 | 80,
  macAddress: string,
  type: 'comanda' | 'factura' = 'factura'
): Promise<boolean> => {
  try {
    try {
      const configRes = await getConfiguracion();
      const config = configRes?.data || configRes;
      if (config && (config.nombreComercial || config.nit || config.direccion || config.telefono)) {
        ticketData.comercio = {
          nombre: config.nombreComercial,
          nit: config.nit,
          direccion: config.direccion,
          telefono: config.telefono,
        };
      }
    } catch (err) {
      console.log('Error fetching configuracion for ticket:', err);
    }
    if (Platform.OS === 'web' || !BLEPrinter) {
      const payload = type === 'comanda' ? generateComandaPayload(ticketData, paperSize) : generateTicketPayload(ticketData, paperSize);
      console.log(`Simulando impresión (${type}) (No hay BLEPrinter)\n`, payload);
      
      if (Platform.OS === 'web') {
        const htmlPayload = getHtmlTicketPayload(ticketData, paperSize, type);
        
        // En móviles (Android Chrome), los iframes ocultos bloquean la impresión.
        // La forma más robusta es inyectar un div en el body, ocultar el resto con CSS @media print,
        // imprimir la ventana principal y luego limpiar.
        
        const printDiv = document.createElement('div');
        printDiv.id = 'ticket-print-area';
        printDiv.innerHTML = htmlPayload;
        
        const style = document.createElement('style');
        style.id = 'ticket-print-style';
        style.innerHTML = `
          @media screen {
            #ticket-print-area {
              position: absolute;
              left: -9999px;
              top: -9999px;
            }
          }
          @media print {
            body * {
              visibility: hidden;
            }
            #ticket-print-area, #ticket-print-area * {
              visibility: visible;
            }
            #ticket-print-area {
              position: absolute;
              left: 0;
              top: 0;
              margin: 0; 
              padding: 10px; 
              font-family: monospace; 
              white-space: pre; 
              font-size: 14px;
              line-height: 1.2;
              width: max-content;
              color: black;
            }
            @page {
              margin: 0;
            }
          }
        `;

        document.head.appendChild(style);
        document.body.appendChild(printDiv);
        
        // Forzar reflujo para que el navegador aplique los estilos inmediatamente antes de imprimir
        // Esto evita tener que usar setTimeout, el cual hace que Chrome Móvil pierda 
        // el contexto de acción del usuario y bloquee la impresión.
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        printDiv.offsetHeight;

        window.print();
        
        // Limpieza diferida (se ejecutará cuando se cierre el diálogo de impresión o retorne el hilo)
        setTimeout(() => {
          if (document.body.contains(printDiv)) {
            document.body.removeChild(printDiv);
          }
          if (document.head.contains(style)) {
            document.head.removeChild(style);
          }
        }, 1000);
      }
      return true; // Simulado
    }

    // Helper for logo printing
    const printLogoIfConfigured = async () => {
      if (type === 'factura') {
        try {
          const configReq = await getConfiguracion();
          const conf = configReq.data || configReq;
          if (conf.imprimirLogo && conf.logoUrl) {
            const logoWidth = paperSize === 58 ? (conf.logoSize58 || 380) : (conf.logoSize80 || 500);
            const response = await fetch(conf.logoUrl);
            const blob = await response.blob();
            const base64Logo = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const b64 = (reader.result as string).split(',')[1];
                resolve(b64);
              };
              reader.readAsDataURL(blob);
            });
            
            if (base64Logo && BLEPrinter.printImageBase64) {
              await BLEPrinter.printImageBase64(base64Logo, { imageWidth: logoWidth });
              await new Promise(resolve => setTimeout(resolve, 800));
            }
          }
        } catch (logoErr) {
          console.log('Error imprimiendo logo:', logoErr);
        }
      }
    };

    // Intentar imprimir sin reconectar si es la misma impresora
    let connected = false;
    if (currentConnectedMac === macAddress) {
      try {
        await printLogoIfConfigured();
        const payload = type === 'comanda' ? generateComandaPayload(ticketData, paperSize) : generateTicketPayload(ticketData, paperSize);
        await BLEPrinter.printText(payload);
        return true;
      } catch (quickPrintErr) {
        console.log('Fallo al imprimir directamente, se intentará reconectar...', quickPrintErr);
        currentConnectedMac = null;
      }
    }

    if (!connected) {
      try {
        try {
          await BLEPrinter.init();
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (initErr) {
          console.log('Fallo al inicializar Bluetooth (¿apagado?):', initErr);
          throw initErr;
        }
        await BLEPrinter.connectPrinter(macAddress);
        currentConnectedMac = macAddress;
      } catch (connectionError) {
        currentConnectedMac = null;
        console.log('La impresora está apagada o desconectada:', connectionError);
        throw new Error(typeof connectionError === 'string' ? connectionError : 'La impresora está apagada o fuera de rango');
      }

      // 1) Intentar imprimir logo si está habilitado y es una factura
      await printLogoIfConfigured();

      const payload = type === 'comanda' ? generateComandaPayload(ticketData, paperSize) : generateTicketPayload(ticketData, paperSize);
      await BLEPrinter.printText(payload);
      return true;
    }
  } catch (error: any) {
    currentConnectedMac = null;
    console.error('Error al imprimir ticket:', error);
    const errorMessage = typeof error === 'string' ? error : (error?.message || JSON.stringify(error) || 'Error desconocido');
    throw new Error(errorMessage);
  }
  return false;
};

export const getCleanTicketPayload = (ticketData: TicketData, paperSize: 58 | 80, type: 'comanda' | 'factura'): string => {
  const payload = type === 'comanda' ? generateComandaPayload(ticketData, paperSize) : generateTicketPayload(ticketData, paperSize);
  return Object.values(ESC_CMD).reduce((acc, cmd) => acc.split(cmd).join(''), payload);
};

export const getHtmlTicketPayload = (ticketData: TicketData, paperSize: 58 | 80, type: 'comanda' | 'factura'): string => {
  const payload = type === 'comanda' ? generateComandaPayload(ticketData, paperSize) : generateTicketPayload(ticketData, paperSize);
  
  let html = payload;
  
  html = html.split(ESC_CMD.ALIGN_CT).join('</div><div style="text-align: center; width: 100%;">');
  html = html.split(ESC_CMD.ALIGN_LT).join('</div><div style="text-align: left; width: 100%;">');
  html = html.split(ESC_CMD.TXT_4SQUARE).join('<span style="font-size: 1.6em; line-height: 1.2;">');
  html = html.split(ESC_CMD.TXT_2HEIGHT).join('<span style="font-size: 1.2em; line-height: 1.2;">');
  html = html.split(ESC_CMD.TXT_2WIDTH).join('<span style="font-size: 1.2em; line-height: 1.2; letter-spacing: 2px;">');
  html = html.split(ESC_CMD.TXT_NORMAL).join('</span>');
  html = html.split(ESC_CMD.TXT_BOLD_ON).join('<b>');
  html = html.split(ESC_CMD.TXT_BOLD_OFF).join('</b>');
  
  html = '<div style="text-align: left; width: 100%;">' + html + '</div>';
  
  return html;
};
