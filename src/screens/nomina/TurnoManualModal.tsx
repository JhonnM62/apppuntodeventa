import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, ScrollView, Platform, KeyboardAvoidingView } from 'react-native';
import { Text } from '../../components/ui/text';
import { Ionicons } from '@expo/vector-icons';
import { useCustomAlert } from '../../context/CustomAlertContext';
import DateTimePicker from '@react-native-community/datetimepicker';
import { createTurnoManual } from '../../services/nomina.service';
import { Button } from '../../components/ui/button';

interface Props {
  visible: boolean;
  empleado: any;
  onClose: () => void;
  onSuccess: () => void;
}

export default function TurnoManualModal({ visible, empleado, onClose, onSuccess }: Props) {
  const { showAlert } = useCustomAlert();
  const [loading, setLoading] = useState(false);
  
  // Lista de fechas seleccionadas
  const [fechas, setFechas] = useState<string[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // Horas
  const [horaEntrada, setHoraEntrada] = useState(new Date());
  const [showTimeEntrada, setShowTimeEntrada] = useState(false);
  
  const [horaSalida, setHoraSalida] = useState<Date | null>(null);
  const [showTimeSalida, setShowTimeSalida] = useState(false);

  useEffect(() => {
    if (visible) {
      setFechas([]);
      setCurrentDate(new Date());
      const now = new Date();
      now.setHours(8, 0, 0, 0);
      setHoraEntrada(now);
      setHoraSalida(null);
    }
  }, [visible]);

  const handleAddFecha = () => {
    const dStr = currentDate.toISOString().split('T')[0];
    if (!fechas.includes(dStr)) {
      setFechas([...fechas, dStr]);
    } else {
      showAlert({ type: 'warning', title: 'Atención', message: 'Esta fecha ya fue agregada' });
    }
  };

  const removeFecha = (f: string) => {
    setFechas(fechas.filter(x => x !== f));
  };

  const formatTimeStr = (d: Date) => {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const handleSave = async () => {
    if (fechas.length === 0) {
      showAlert({ type: 'warning', title: 'Atención', message: 'Debes agregar al menos una fecha' });
      return;
    }

    try {
      setLoading(true);
      await createTurnoManual({
        usuarioId: empleado.IDusuarios,
        fechas,
        horaEntrada: formatTimeStr(horaEntrada),
        horaSalida: horaSalida ? formatTimeStr(horaSalida) : undefined,
      });
      
      showAlert({ type: 'success', title: 'Éxito', message: 'Turnos creados exitosamente' });
      onSuccess();
      onClose();
    } catch (e: any) {
      showAlert({ type: 'error', title: 'Error', message: e.response?.data?.message || 'Error al crear turnos' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView style={styles.modalContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Crear Turno Manual</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>
          
          <Text style={styles.subtitle}>Empleado: {empleado?.nombre}</Text>

          <ScrollView style={styles.scroll}>
            <View style={styles.section}>
              <Text style={styles.label}>Seleccionar Días</Text>
              <View style={styles.row}>
                {Platform.OS === 'web' ? (
                  React.createElement('input', {
                    type: 'date',
                    value: currentDate.toISOString().split('T')[0],
                    onChange: (e: any) => {
                      if (e.target.value) setCurrentDate(new Date(e.target.value + 'T12:00:00Z'));
                    },
                    style: styles.webInput
                  })
                ) : (
                  <>
                    <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
                      <Ionicons name="calendar-outline" size={18} color="#374151" />
                      <Text style={styles.dateBtnText}>{currentDate.toLocaleDateString('es-ES')}</Text>
                    </TouchableOpacity>
                    {showDatePicker && (
                      <DateTimePicker
                        value={currentDate}
                        mode="date"
                        display="default"
                        onChange={(e, date) => {
                          setShowDatePicker(false);
                          if (date) setCurrentDate(date);
                        }}
                      />
                    )}
                  </>
                )}
                <TouchableOpacity style={styles.addBtn} onPress={handleAddFecha}>
                  <Text style={styles.addBtnText}>Agregar</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.badges}>
                {fechas.map(f => (
                  <View key={f} style={styles.badge}>
                    <Text style={styles.badgeText}>{f}</Text>
                    <TouchableOpacity onPress={() => removeFecha(f)}>
                      <Ionicons name="close-circle" size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))}
                {fechas.length === 0 && <Text style={styles.helperText}>No has agregado ninguna fecha</Text>}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Hora de Entrada (Para todos los días)</Text>
              {Platform.OS === 'web' ? (
                React.createElement('input', {
                  type: 'time',
                  value: horaEntrada.toTimeString().slice(0,5),
                  onChange: (e: any) => {
                    if (e.target.value) {
                      const [h, m] = e.target.value.split(':');
                      const d = new Date(); d.setHours(h, m, 0, 0);
                      setHoraEntrada(d);
                    }
                  },
                  style: styles.webInput
                })
              ) : (
                <>
                  <TouchableOpacity style={styles.dateBtn} onPress={() => setShowTimeEntrada(true)}>
                    <Ionicons name="time-outline" size={18} color="#374151" />
                    <Text style={styles.dateBtnText}>{formatTimeStr(horaEntrada)}</Text>
                  </TouchableOpacity>
                  {showTimeEntrada && (
                    <DateTimePicker
                      value={horaEntrada}
                      mode="time"
                      is24Hour={false}
                      onChange={(e, date) => {
                        setShowTimeEntrada(false);
                        if (date) setHoraEntrada(date);
                      }}
                    />
                  )}
                </>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Hora de Salida (Opcional)</Text>
              {Platform.OS === 'web' ? (
                React.createElement('input', {
                  type: 'time',
                  value: horaSalida ? horaSalida.toTimeString().slice(0,5) : '',
                  onChange: (e: any) => {
                    if (e.target.value) {
                      const [h, m] = e.target.value.split(':');
                      const d = new Date(); d.setHours(h, m, 0, 0);
                      setHoraSalida(d);
                    } else {
                      setHoraSalida(null);
                    }
                  },
                  style: styles.webInput
                })
              ) : (
                <>
                  <TouchableOpacity style={styles.dateBtn} onPress={() => setShowTimeSalida(true)}>
                    <Ionicons name="time-outline" size={18} color="#374151" />
                    <Text style={styles.dateBtnText}>{horaSalida ? formatTimeStr(horaSalida) : 'Seleccionar...'}</Text>
                  </TouchableOpacity>
                  {showTimeSalida && (
                    <DateTimePicker
                      value={horaSalida || new Date()}
                      mode="time"
                      is24Hour={false}
                      onChange={(e, date) => {
                        setShowTimeSalida(false);
                        if (date) setHoraSalida(date);
                      }}
                    />
                  )}
                  {horaSalida && (
                    <TouchableOpacity onPress={() => setHoraSalida(null)} style={{marginTop: 8}}>
                      <Text style={{color: '#ef4444', fontSize: 12}}>Limpiar Hora de Salida (Dejar Activo)</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>

            <Button onPress={handleSave} loading={loading} style={{marginTop: 20}}>
              Guardar Turnos
            </Button>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  closeBtn: {
    padding: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
  },
  scroll: {
    flexGrow: 0,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  webInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#111827',
    outlineStyle: 'none',
    flex: 1,
  } as any,
  dateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateBtnText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#111827',
  },
  addBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  badgeText: {
    fontSize: 12,
    color: '#1e40af',
    marginRight: 4,
  },
  helperText: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
  }
});
