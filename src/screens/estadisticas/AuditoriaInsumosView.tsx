import React, { useMemo, useState } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text } from '../../components/ui/text';
import { Ionicons } from '@expo/vector-icons';
import { useEstadisticasStore } from '../../store/useEstadisticasStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// Optional import for Print to avoid crashes on custom dev clients without the native module built in
let Print: any = null;
let Sharing: any = null;
try {
  Print = require('expo-print');
  Sharing = require('expo-sharing');
} catch (e) {
  console.warn('expo-print o expo-sharing no disponibles');
}

interface Props {
  startDate: Date;
  endDate: Date;
  nombreNegocio?: string;
}

export default function AuditoriaInsumosView({ startDate, endDate, nombreNegocio }: Props) {
  const { auditoriaData, isLoading } = useEstadisticasStore();
  const { primaryColor } = useSettingsStore();
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const mainColor = primaryColor || '#10b981';

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center py-20">
        <ActivityIndicator size="large" color={mainColor} />
        <Text className="mt-4 text-gray-500 font-medium">Calculando auditoría histórica...</Text>
      </View>
    );
  }

  if (!auditoriaData || !auditoriaData.data || auditoriaData.data.length === 0) {
    return (
      <View className="flex-1 justify-center items-center py-20 px-6">
        <Ionicons name="shield-checkmark" size={64} color="#d1d5db" />
        <Text className="mt-4 text-gray-500 font-bold text-center text-lg">No hay descuadres reportados</Text>
        <Text className="mt-2 text-gray-400 text-center text-sm">Todas las cajas en este rango cuadraron perfectamente sus insumos o no hubo actividad.</Text>
      </View>
    );
  }

  const { data, ranking } = auditoriaData;

  const handleExportPDF = async () => {
    if (!Print || !Sharing) return;
    setIsGeneratingPdf(true);
    
    try {
      const startStr = format(startDate, "d 'de' MMMM, yyyy", { locale: es });
      const endStr = format(endDate, "d 'de' MMMM, yyyy", { locale: es });

      const rankingHtml = ranking.map((r: any, i: number) => `
        <div style="background-color: #fff1f2; border: 1px solid #fecdd3; padding: 10px; border-radius: 8px; margin-bottom: 10px;">
          <strong style="color: #be123c;">#${i + 1} ${r.nombre}</strong><br/>
          <span style="font-size: 12px; color: #4b5563;">Descuadres acumulados: <strong>${r.totalDescuadresAbsoluto}</strong> (Faltan: ${r.totalFaltantes} | Sobran: ${r.totalSobrantes})</span>
        </div>
      `).join('');

      const tableRows = data.map((r: any) => {
        let detailsHtml = '';
        if (r.detalles && r.detalles.length > 0) {
          const detailRows = r.detalles.map((d: any) => `
            <tr>
              <td colspan="3" style="padding: 4px 8px; border-bottom: 1px dotted #e5e7eb; padding-left: 20px; font-size: 10px; color: #6b7280;">
                ${format(new Date(d.fecha), 'dd MMM yyyy', { locale: es })}
              </td>
              <td style="padding: 4px 8px; border-bottom: 1px dotted #e5e7eb; text-align: center; font-size: 10px; color: #be123c; font-weight: bold;">
                ${d.tipo === 'FALTANTE' ? '-' + d.diferencia : ''}
              </td>
              <td style="padding: 4px 8px; border-bottom: 1px dotted #e5e7eb; text-align: center; font-size: 10px; color: #047857; font-weight: bold;">
                ${d.tipo === 'SOBRANTE' ? '+' + Math.abs(d.diferencia) : ''}
              </td>
            </tr>
          `).join('');
          
          detailsHtml = `
            <tr>
              <td colspan="5" style="padding: 0; background-color: #f9fafb;">
                <table style="margin: 0; width: 100%; border: none; font-size: 10px;">
                  ${detailRows}
                </table>
              </td>
            </tr>
          `;
        }

        return `
        <tr style="background-color: #fff;">
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${r.nombre}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${r.gastadoFisico}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${r.ventasSistema}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #be123c; font-weight: bold;">${r.totalFaltantes > 0 ? r.totalFaltantes : '-'}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #047857; font-weight: bold;">${r.totalSobrantes > 0 ? r.totalSobrantes : '-'}</td>
        </tr>
        ${detailsHtml}
        `;
      }).join('');

      const html = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #1f2937; }
              h1 { color: ${mainColor}; margin-bottom: 5px; font-size: 24px; }
              h2 { font-size: 16px; color: #6b7280; margin-top: 0; margin-bottom: 20px; }
              h3 { font-size: 18px; color: #374151; border-bottom: 2px solid ${mainColor}; padding-bottom: 5px; margin-top: 30px; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
              th { background-color: #f3f4f6; color: #374151; padding: 10px 8px; text-align: left; font-size: 12px; text-transform: uppercase; }
              th.center { text-align: center; }
            </style>
          </head>
          <body>
            <h1>${nombreNegocio || 'Auditoría'}</h1>
            <h2>Reporte de Descuadres de Insumos<br/>Del ${startStr} al ${endStr}</h2>
            
            ${ranking.length > 0 ? `
              <h3>Top Insumos Más Descuadrados</h3>
              <div style="margin-top: 15px;">${rankingHtml}</div>
            ` : ''}

            <h3>Detalle General por Insumo</h3>
            <table>
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th class="center">Desc. Físico</th>
                  <th class="center">Desc. Sistema</th>
                  <th class="center" style="color: #be123c;">Faltantes</th>
                  <th class="center" style="color: #047857;">Sobrantes</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>
            
            <div style="margin-top: 40px; font-size: 10px; color: #9ca3af; text-align: center;">
              Reporte generado automáticamente - ${format(new Date(), 'dd/MM/yyyy HH:mm')}
            </div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView className="flex-1 px-4 pt-4" showsVerticalScrollIndicator={false}>
        
        {/* RANKING */}
        {ranking && ranking.length > 0 && (
          <View className="mb-6">
            <Text className="text-gray-800 font-black text-lg mb-3">Top Insumos Descuadrados</Text>
            <View className="flex-row">
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {ranking.map((r: any, idx: number) => (
                  <View key={idx} className="bg-white p-3 rounded-xl mr-3 shadow-sm border border-red-100" style={{ width: 140 }}>
                    <View className="flex-row items-center justify-between mb-2">
                      <View className="bg-red-100 w-6 h-6 rounded-full items-center justify-center">
                        <Text className="text-red-700 font-black text-xs">#{idx + 1}</Text>
                      </View>
                      <Ionicons name="warning" size={16} color="#ef4444" />
                    </View>
                    <Text className="font-bold text-gray-800 text-sm mb-1" numberOfLines={1}>{r.nombre}</Text>
                    <Text className="text-xs text-gray-500 mb-1">Impacto: <Text className="font-bold text-gray-700">{r.totalDescuadresAbsoluto}</Text></Text>
                    <View className="flex-row justify-between mt-1 pt-2 border-t border-gray-100">
                      <Text className="text-[10px] font-bold text-red-600">-{r.totalFaltantes}</Text>
                      <Text className="text-[10px] font-bold text-green-600">+{r.totalSobrantes}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>
        )}

        {/* DETALLE */}
        <View className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
          <View className="bg-gray-50 p-3 border-b border-gray-100 flex-row items-center justify-between">
            <Text className="font-bold text-gray-700 text-sm">Detalle de Insumos</Text>
            <Text className="text-xs text-gray-500">{data.length} registros</Text>
          </View>
          
          <View className="flex-row border-b border-gray-100 bg-gray-50 p-2">
            <Text className="flex-[2] text-[10px] font-bold text-gray-500 uppercase">Insumo</Text>
            <Text className="flex-[1] text-[10px] font-bold text-red-600 uppercase text-center">Faltantes</Text>
            <Text className="flex-[1] text-[10px] font-bold text-green-600 uppercase text-center">Sobrantes</Text>
          </View>

          {data.map((row: any, idx: number) => (
            <View key={idx} className="border-b border-gray-100 bg-white">
              <View className="flex-row p-3 items-center">
                <View className="flex-[2] pr-2">
                  <Text className="font-bold text-xs text-gray-800">{row.nombre}</Text>
                  <Text className="text-[10px] text-gray-400 mt-0.5">Sistema: {row.ventasSistema} | Físico: {row.gastadoFisico}</Text>
                </View>
                <View className="flex-[1] items-center justify-center">
                  {row.totalFaltantes > 0 ? (
                    <View className="bg-red-100 px-2 py-1 rounded-md">
                      <Text className="text-red-700 font-bold text-xs">-{row.totalFaltantes}</Text>
                    </View>
                  ) : (
                    <Text className="text-gray-300">-</Text>
                  )}
                </View>
                <View className="flex-[1] items-center justify-center">
                  {row.totalSobrantes > 0 ? (
                    <View className="bg-green-100 px-2 py-1 rounded-md">
                      <Text className="text-green-700 font-bold text-xs">+{row.totalSobrantes}</Text>
                    </View>
                  ) : (
                    <Text className="text-gray-300">-</Text>
                  )}
                </View>
              </View>
              {row.detalles && row.detalles.length > 0 && (
                <View className="bg-gray-50 px-4 py-2 border-t border-gray-100">
                  <Text className="text-[10px] font-bold text-gray-500 mb-1">DÍAS CON DESCUADRE:</Text>
                  {row.detalles.map((d: any, i: number) => (
                    <View key={i} className="flex-row justify-between mb-1">
                      <Text className="text-[10px] text-gray-600">
                        {format(new Date(d.fecha), 'dd MMM yyyy', { locale: es })}
                      </Text>
                      {d.tipo === 'FALTANTE' ? (
                        <Text className="text-[10px] font-bold text-red-600">-{d.diferencia}</Text>
                      ) : (
                        <Text className="text-[10px] font-bold text-green-600">+{Math.abs(d.diferencia)}</Text>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>

      </ScrollView>
      
      {/* EXPORT BUTTON */}
      <View className="p-4 bg-white border-t border-gray-200">
        <TouchableOpacity 
          className="flex-row items-center justify-center p-4 rounded-xl"
          style={{ backgroundColor: mainColor, opacity: isGeneratingPdf ? 0.7 : 1 }}
          onPress={handleExportPDF}
          disabled={isGeneratingPdf}
        >
          {isGeneratingPdf ? (
            <ActivityIndicator color="#fff" className="mr-2" />
          ) : (
            <Ionicons name="document-text" size={20} color="#fff" className="mr-2" />
          )}
          <Text className="text-white font-bold text-base ml-2">
            {isGeneratingPdf ? 'Generando Reporte...' : 'Exportar Auditoría a PDF'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
