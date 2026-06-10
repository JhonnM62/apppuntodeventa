import React, { useState, useEffect } from 'react';
import { View, Text as RNText, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Switch, Platform, PermissionsAndroid, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import usePrinterStore, { PrinterDevice, PrinterConfig } from '../../store/usePrinterStore';
import { updatePrinterConfigs } from '../../services/printer-config';
import { useCustomAlert } from '../../context/CustomAlertContext';

// Mock the BLE Printer for now since it requires physical device / native code
// In real usage, you'd import { BLEPrinter } from 'react-native-thermal-receipt-printer-image-qr';
let BLEPrinter: any = null;
try {
  const PrinterModule = require('react-native-thermal-receipt-printer-image-qr');
  BLEPrinter = PrinterModule.BLEPrinter;
} catch (error) {
  console.log('Bluetooth printer library not available on this platform/build');
}

const PrinterSettingsScreen = ({ navigation }: any) => {
  const { currentPrinter, paperSize, isConnected, configs, setPrinter, setPaperSize, setConnected, fetchConfigs, setConfigs } = usePrinterStore();
  const { showAlert } = useCustomAlert();
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connectingTo, setConnectingTo] = useState<string | null>(null);
  const [showBluetoothBanner, setShowBluetoothBanner] = useState(false);
  const [isSavingConfigs, setIsSavingConfigs] = useState(false);
  const insets = useSafeAreaInsets();

  // Estados disponibles en la aplicación (basados en constants de ventas)
  const ORDER_STATUSES = [
    { key: 'PAGADO', label: 'Pagado' },
    { key: 'CARRITO', label: 'Carrito' },
    { key: 'TOMADO', label: 'Tomado' },
    { key: 'ENTREGADO', label: 'Entregado' },
    { key: 'FINALIZADO', label: 'Finalizado' },
    { key: 'CREDITO', label: 'Crédito' },
  ];

  useEffect(() => {
    // Fetch printer configs on mount
    fetchConfigs();
  }, []);

  const handleToggleConfig = async (statusKey: string, field: 'imprimirComanda' | 'imprimirFactura', newValue: boolean) => {
    // Optimistic update
    const currentConfigs = [...configs];
    let found = false;
    const newConfigs = currentConfigs.map(c => {
      if (c.estadoOrden === statusKey) {
        found = true;
        return { ...c, [field]: newValue };
      }
      return c;
    });
    
    // Si no existía, lo agregamos
    if (!found) {
      newConfigs.push({ 
        estadoOrden: statusKey, 
        imprimirComanda: field === 'imprimirComanda' ? newValue : false,
        imprimirFactura: field === 'imprimirFactura' ? newValue : false
      });
    }
    
    setConfigs(newConfigs);

    try {
      setIsSavingConfigs(true);
      await updatePrinterConfigs(newConfigs);
    } catch (error) {
      setConfigs(currentConfigs);
      showAlert({ type: 'error', title: 'Error', message: 'No se pudo guardar la configuración de impresión automática.' });
    } finally {
      setIsSavingConfigs(false);
    }
  };

  const scanDevices = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ]);
        
        // En Android 12+ (API 31+), necesitamos BLUETOOTH_SCAN y BLUETOOTH_CONNECT
        // En Android 11 y anteriores, solo necesitamos ACCESS_FINE_LOCATION
        const sdkInt = Platform.Version;
        if (typeof sdkInt === 'number' && sdkInt >= 31) {
          if (
            granted['android.permission.BLUETOOTH_SCAN'] !== PermissionsAndroid.RESULTS.GRANTED ||
            granted['android.permission.BLUETOOTH_CONNECT'] !== PermissionsAndroid.RESULTS.GRANTED
          ) {
            showAlert({ type: 'warning', title: 'Permisos requeridos', message: 'Se necesitan permisos de Bluetooth para buscar impresoras en Android 12+.' });
            return;
          }
        } else {
          if (granted['android.permission.ACCESS_FINE_LOCATION'] !== PermissionsAndroid.RESULTS.GRANTED) {
            showAlert({ type: 'warning', title: 'Permisos requeridos', message: 'Se necesita permiso de ubicación para usar Bluetooth en esta versión de Android.' });
            return;
          }
        }
      } catch (err) {
        console.warn(err);
      }
    }

    if (!BLEPrinter) {
      showAlert({ type: 'error', title: 'Error', message: 'El módulo de impresión Bluetooth no está disponible en este simulador. Debes compilar la aplicación para un dispositivo real.' });
      
      // Mock devices for development UI testing
      setScanning(true);
      setTimeout(() => {
        setDevices([
          { device_name: 'MOCK_PRINTER_58', inner_mac_address: '00:11:22:33:44:55' },
          { device_name: 'MOCK_PRINTER_80', inner_mac_address: 'AA:BB:CC:DD:EE:FF' }
        ]);
        setScanning(false);
      }, 1500);
      return;
    }

    setScanning(true);
    try {
      // Importante: La librería a veces requiere un delay después de pedir permisos
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Asegurarnos de que el Bluetooth está encendido antes de inicializar
      // Inicializar el módulo nativo
      await BLEPrinter.init();
      
      // Pequeño delay adicional para dar tiempo a que el módulo se inicialice
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const results = await BLEPrinter.getDeviceList();
      setDevices(results || []);
    } catch (err: any) {
      console.log('Error escaneando:', err);
      
      // La librería arroja un string directo en lugar de un objeto Error, extraemos el mensaje real
      const errorMessage = typeof err === 'string' ? err : (err?.message || JSON.stringify(err) || '');
      
      // Si el error es específicamente que el adaptador está apagado, mostramos el Snackbar
      if (errorMessage.toLowerCase().includes('not enabled') || errorMessage.toLowerCase().includes('bluetooth')) {
        setShowBluetoothBanner(true);
        setTimeout(() => setShowBluetoothBanner(false), 6000);
      } else {
        showAlert({
          type: 'error',
          title: 'Error de Bluetooth',
          message: `Fallo técnico: ${errorMessage}\nAsegúrate de tener el Bluetooth y el GPS/Ubicación encendidos en tu celular.`
        });
      }
    } finally {
      setScanning(false);
    }
  };

  const activateBluetooth = async () => {
    setShowBluetoothBanner(false);
    if (Platform.OS === 'android') {
      try {
        // Intenta abrir el prompt nativo de Android ("Una aplicación quiere activar el Bluetooth")
        await Linking.sendIntent('android.bluetooth.adapter.action.REQUEST_ENABLE');
      } catch (e) {
        try {
          // Fallback a los ajustes completos
          await Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
        } catch (e2) {
          Linking.openSettings();
        }
      }
    }
  };

  const connectPrinter = async (printer: PrinterDevice) => {
    setConnectingTo(printer.inner_mac_address);
    try {
      if (BLEPrinter) {
        // MUY IMPORTANTE: Inicializar el módulo antes de intentar conectar
        // Si el Bluetooth está apagado o el módulo no ha arrancado, init() lanza un error 
        // controlado en JS y evita que la app se crashee con un NullPointerException nativo en Java.
        try {
          await BLEPrinter.init();
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (initErr) {
          console.log('Init previo a conexión falló:', initErr);
          throw initErr; // Lanzamos el error para que lo atrape el catch principal
        }

        await BLEPrinter.connectPrinter(printer.inner_mac_address);
      } else {
        // Mock connection delay
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      setPrinter(printer);
      setConnected(true);
      showAlert({ type: 'success', title: 'Éxito', message: `Conectado a ${printer.device_name}` });
    } catch (err: any) {
      setConnected(false);
      
      const errorMessage = typeof err === 'string' ? err : (err?.message || JSON.stringify(err) || '');
      
      if (errorMessage.toLowerCase().includes('not enabled') || errorMessage.toLowerCase().includes('bluetooth')) {
        setShowBluetoothBanner(true);
        setTimeout(() => setShowBluetoothBanner(false), 6000);
      } else {
        showAlert({ type: 'error', title: 'Error de conexión', message: errorMessage || 'No se pudo conectar a la impresora.' });
      }
    } finally {
      setConnectingTo(null);
    }
  };

  const disconnectPrinter = () => {
    try {
      if (BLEPrinter) {
        BLEPrinter.closeConn();
      }
      setPrinter(null);
      setConnected(false);
      showAlert({ type: 'info', title: 'Desconectado', message: 'Se ha desconectado la impresora actual.' });
    } catch (error) {
      console.log(error);
    }
  };

  const printTestTicket = async () => {
    if (!currentPrinter) {
      showAlert({ type: 'error', title: 'Error', message: 'No hay ninguna impresora conectada.' });
      return;
    }

    try {
      const is58mm = paperSize === 58;
      const separator = is58mm ? '-'.repeat(32) : '-'.repeat(48);
      const title = '<C>TICKET DE PRUEBA</C>\n';
      const subtitle = '<C>SISTEMA POS QHUBOMOR</C>\n';
      const content = `Impresora: ${currentPrinter.device_name}\nAncho de papel: ${paperSize}mm\nPlataforma: ${Platform.OS}\n\n`;
      const footer = '<C>¡Impresion Exitosa!</C>\n';
      
      const payload = `${title}${subtitle}${separator}\n${content}${separator}\n${footer}\n\n\n`;

      if (BLEPrinter) {
        await BLEPrinter.printText(payload);
      } else {
        showAlert({ type: 'info', title: 'Simulación de Impresión', message: `Imprimiendo en formato ${paperSize}mm...\n\n${payload}` });
      }
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Error de impresión', message: err.message || 'Fallo al imprimir el ticket.' });
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <RNText style={styles.headerTitle}>Impresora POS</RNText>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Estado actual */}
        <View style={styles.card}>
          <RNText style={styles.cardTitle}>Estado de Conexión</RNText>
          <View style={styles.statusRow}>
            <View style={styles.statusIconContainer}>
              <MaterialCommunityIcons 
                name={isConnected ? "printer-pos-check" : "printer-pos-cancel"} 
                size={40} 
                color={isConnected ? "#22c55e" : "#ef4444"} 
              />
            </View>
            <View style={styles.statusInfo}>
              <RNText style={styles.statusTitle}>
                {isConnected ? 'Conectada' : 'Desconectada'}
              </RNText>
              <RNText style={styles.statusDesc}>
                {currentPrinter ? currentPrinter.device_name : 'Ninguna impresora configurada'}
              </RNText>
              {currentPrinter && (
                <RNText style={styles.statusMac}>{currentPrinter.inner_mac_address}</RNText>
              )}
            </View>
          </View>
          
          {currentPrinter && (
            <View style={styles.actionButtons}>
              <TouchableOpacity style={styles.testBtn} onPress={printTestTicket}>
                <Ionicons name="print-outline" size={18} color="#fff" />
                <RNText style={styles.testBtnText}>Imprimir Prueba</RNText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.disconnectBtn} onPress={disconnectPrinter}>
                <Ionicons name="close-circle-outline" size={18} color="#ef4444" />
                <RNText style={styles.disconnectBtnText}>Desconectar</RNText>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Configuración de Papel */}
        <View style={styles.card}>
          <RNText style={styles.cardTitle}>Tamaño de Papel</RNText>
          <View style={styles.paperOptions}>
            <TouchableOpacity 
              style={[styles.paperOption, paperSize === 58 && styles.paperOptionActive]}
              onPress={() => setPaperSize(58)}
            >
              <MaterialCommunityIcons name="receipt-outline" size={24} color={paperSize === 58 ? '#3b82f6' : '#9ca3af'} />
              <RNText style={[styles.paperOptionText, paperSize === 58 && styles.paperOptionTextActive]}>58mm</RNText>
              <RNText style={styles.paperOptionDesc}>Impresora Pequeña</RNText>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.paperOption, paperSize === 80 && styles.paperOptionActive]}
              onPress={() => setPaperSize(80)}
            >
              <MaterialCommunityIcons name="receipt-text-outline" size={32} color={paperSize === 80 ? '#3b82f6' : '#9ca3af'} />
              <RNText style={[styles.paperOptionText, paperSize === 80 && styles.paperOptionTextActive]}>80mm</RNText>
              <RNText style={styles.paperOptionDesc}>Impresora Grande</RNText>
            </TouchableOpacity>
          </View>
        </View>

        {/* Escaneo de Dispositivos */}
        <View style={styles.card}>
          <View style={styles.scanHeader}>
            <RNText style={styles.cardTitle}>Dispositivos Bluetooth</RNText>
            <TouchableOpacity style={styles.scanBtn} onPress={scanDevices} disabled={scanning}>
              {scanning ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <RNText style={styles.scanBtnText}>Buscar</RNText>
              )}
            </TouchableOpacity>
          </View>

          {devices.length === 0 && !scanning ? (
            <View style={styles.emptyScan}>
              <Ionicons name="bluetooth-outline" size={40} color="#d1d5db" />
              <RNText style={styles.emptyScanText}>Busca dispositivos para conectar tu impresora</RNText>
            </View>
          ) : (
            <View style={styles.deviceList}>
              {devices.map((device, index) => {
                const isThisConnected = currentPrinter?.inner_mac_address === device.inner_mac_address;
                const isConnecting = connectingTo === device.inner_mac_address;

                return (
                  <TouchableOpacity 
                    key={`${device.inner_mac_address}-${index}`}
                    style={[styles.deviceItem, isThisConnected && styles.deviceItemActive]}
                    onPress={() => connectPrinter(device)}
                    disabled={isThisConnected || isConnecting}
                  >
                    <View style={styles.deviceIcon}>
                      <Ionicons name="print" size={24} color={isThisConnected ? '#3b82f6' : '#6b7280'} />
                    </View>
                    <View style={styles.deviceInfo}>
                      <RNText style={[styles.deviceName, isThisConnected && styles.deviceNameActive]}>
                        {device.device_name || 'Impresora Desconocida'}
                      </RNText>
                      <RNText style={styles.deviceMac}>{device.inner_mac_address}</RNText>
                    </View>
                    <View style={styles.deviceStatus}>
                      {isConnecting ? (
                        <ActivityIndicator size="small" color="#3b82f6" />
                      ) : isThisConnected ? (
                        <Ionicons name="checkmark-circle" size={24} color="#22c55e" />
                      ) : (
                        <RNText style={styles.connectText}>Conectar</RNText>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Impresión Automática */}
        <View style={styles.card}>
          <View style={styles.autoPrintHeader}>
            <RNText style={styles.cardTitle}>Impresión Automática</RNText>
            {isSavingConfigs && <ActivityIndicator size="small" color="#3b82f6" />}
          </View>
          <RNText style={styles.cardDescription}>
            Selecciona en qué estados de la orden deseas que se imprima un ticket automáticamente.
          </RNText>

          <View style={styles.switchesContainer}>
            <View style={styles.switchHeaderRow}>
              <RNText style={[styles.switchLabel, { flex: 2 }]}></RNText>
              <RNText style={[styles.switchLabel, { flex: 1, textAlign: 'center', fontSize: 12, color: '#6b7280' }]}>Comanda</RNText>
              <RNText style={[styles.switchLabel, { flex: 1, textAlign: 'center', fontSize: 12, color: '#6b7280' }]}>Factura</RNText>
            </View>
            {ORDER_STATUSES.map((status) => {
              const config = configs.find(c => c.estadoOrden === status.key);
              const isComandaEnabled = config?.imprimirComanda || false;
              const isFacturaEnabled = config?.imprimirFactura || false;
              return (
                <View key={status.key} style={styles.switchRow}>
                  <RNText style={[styles.switchLabel, { flex: 2 }]}>{status.label}</RNText>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Switch
                      value={isComandaEnabled}
                      onValueChange={(val) => handleToggleConfig(status.key, 'imprimirComanda', val)}
                      trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
                      thumbColor={isComandaEnabled ? '#3b82f6' : '#f3f4f6'}
                      disabled={isSavingConfigs}
                    />
                  </View>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Switch
                      value={isFacturaEnabled}
                      onValueChange={(val) => handleToggleConfig(status.key, 'imprimirFactura', val)}
                      trackColor={{ false: '#d1d5db', true: '#c4b5fd' }}
                      thumbColor={isFacturaEnabled ? '#8b5cf6' : '#f3f4f6'}
                      disabled={isSavingConfigs}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Snackbar estilo nativo para activar Bluetooth */}
      {showBluetoothBanner && (
        <View style={[styles.snackbar, { bottom: insets.bottom + 20 }]}>
          <RNText style={styles.snackbarText}>¡El 'Bluetooth' no está activado!</RNText>
          <TouchableOpacity onPress={activateBluetooth} activeOpacity={0.7}>
            <RNText style={styles.snackbarAction}>ACTIVAR</RNText>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#374151', marginBottom: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusIconContainer: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#f9fafb', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  statusInfo: { flex: 1 },
  statusTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 4 },
  statusDesc: { fontSize: 14, color: '#4b5563', marginBottom: 2 },
  statusMac: { fontSize: 12, color: '#9ca3af' },
  actionButtons: { flexDirection: 'row', marginTop: 20, gap: 12 },
  testBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#3b82f6', paddingVertical: 12, borderRadius: 10 },
  testBtnText: { color: '#fff', fontWeight: '600', marginLeft: 8 },
  disconnectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fef2f2', paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#fca5a5' },
  disconnectBtnText: { color: '#ef4444', fontWeight: '600', marginLeft: 8 },
  paperOptions: { flexDirection: 'row', gap: 16 },
  paperOption: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 20, backgroundColor: '#f9fafb', borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
  paperOptionActive: { backgroundColor: '#eff6ff', borderColor: '#3b82f6' },
  paperOptionText: { fontSize: 16, fontWeight: '700', color: '#4b5563', marginTop: 8, marginBottom: 4 },
  paperOptionTextActive: { color: '#3b82f6' },
  paperOptionDesc: { fontSize: 12, color: '#9ca3af' },
  scanHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  scanBtn: { backgroundColor: '#111827', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, minWidth: 80, alignItems: 'center' },
  scanBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  emptyScan: { alignItems: 'center', paddingVertical: 30 },
  emptyScanText: { color: '#6b7280', marginTop: 12, textAlign: 'center', paddingHorizontal: 20 },
  deviceList: { gap: 10 },
  deviceItem: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#f9fafb', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  deviceItemActive: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  deviceIcon: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', marginRight: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  deviceInfo: { flex: 1 },
  deviceName: { fontSize: 15, fontWeight: '600', color: '#374151', marginBottom: 2 },
  deviceNameActive: { color: '#1e40af' },
  deviceMac: { fontSize: 12, color: '#9ca3af' },
  deviceStatus: { marginLeft: 12 },
  connectText: { fontSize: 13, fontWeight: '600', color: '#3b82f6' },
  autoPrintHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardDescription: { fontSize: 13, color: '#6b7280', marginBottom: 16, lineHeight: 18 },
  switchesContainer: { gap: 12, backgroundColor: '#f9fafb', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  switchHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  switchLabel: { fontSize: 15, fontWeight: '600', color: '#374151' },
  snackbar: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: '#323232',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 999
  },
  snackbarText: {
    color: '#fff',
    fontSize: 14,
  },
  snackbarAction: {
    color: '#fca5a5',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 1
  }
});

export default PrinterSettingsScreen;
