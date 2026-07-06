import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { Text } from '../../components/ui/text';
import { Ionicons } from '@expo/vector-icons';
import { Cargo, ExcepcionHorarioCargo, getExcepcionesPorCargo, createExcepcionHorario, deleteExcepcionHorario } from '../../services/cargos.service';
import { useCustomAlert } from '../../context/CustomAlertContext';
import DateTimePicker from '@react-native-community/datetimepicker';

interface Props {
  visible: boolean;
  cargo: Cargo | null;
  onClose: () => void;
}

export default function ExcepcionHorarioModal({ visible, cargo, onClose }: Props) {
  const { showAlert } = useCustomAlert();
  const [loading, setLoading] = useState(false);
  const [excepciones, setExcepciones] = useState<ExcepcionHorarioCargo[]>([]);
  
  const [fecha, setFecha] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [nombre, setNombre] = useState('');
  const [tarifa, setTarifa] = useState('');
  
  const [horaEntrada, setHoraEntrada] = useState(new Date());
  const [showTimeEntrada, setShowTimeEntrada] = useState(false);
  
  const [horaSalida, setHoraSalida] = useState(new Date());
  const [showTimeSalida, setShowTimeSalida] = useState(false);

  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    if (visible && cargo) {
      loadExcepciones();
    }
  }, [visible, cargo]);

  const loadExcepciones = async () => {
    if (!cargo) return;
    try {
      setLoading(true);
      const res = await getExcepcionesPorCargo(cargo.IDcargo);
      setExcepciones(res.data || []);
    } catch {
      showAlert({ type: 'error', title: 'Error', message: 'No se pudieron cargar las excepciones' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!cargo) return;
    if (!nombre.trim() || !tarifa) {
      showAlert({ type: 'warning', title: 'Atención', message: 'Nombre y tarifa son obligatorios' });
      return;
    }
    try {
      setLoading(true);
      const fechaStr = fecha.toISOString().split('T')[0];
      const hEntrada = horaEntrada.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      const hSalida = horaSalida.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

      await createExcepcionHorario({
        cargoId: cargo.IDcargo,
        fecha: fechaStr,
        nombre,
        tarifa: Number(tarifa),
        horaEntrada: hEntrada,
        horaSalida: hSalida,
      });
      
      showAlert({ type: 'success', title: 'Éxito', message: 'Excepción programada' });
      setNombre('');
      setTarifa('');
      loadExcepciones();
    } catch (e: any) {
      showAlert({ type: 'error', title: 'Error', message: e.response?.data?.message || 'Error al programar' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setLoading(true);
      await deleteExcepcionHorario(id);
      showAlert({ type: 'success', title: 'Éxito', message: 'Excepción eliminada' });
      loadExcepciones();
    } catch {
      showAlert({ type: 'error', title: 'Error', message: 'No se pudo eliminar' });
      setLoading(false);
    }
  };

  const formatFecha = (f: string) => {
    const d = new Date(f);
    return d.toLocaleDateString('es-ES', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  };

  if (!cargo) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView 
        style={styles.modalContainer} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.modalContent, { marginBottom: Platform.OS === 'android' ? keyboardHeight : 0 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Programar Evento</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>
          
          <Text style={styles.subtitle}>Cargo: {cargo.nombre}</Text>

          <View style={styles.formRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Fecha</Text>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
                <Ionicons name="calendar-outline" size={18} color="#374151" />
                <Text style={styles.dateBtnText}>{fecha.toLocaleDateString('es-ES')}</Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={fecha}
                  mode="date"
                  display="default"
                  onChange={(e, d) => {
                    setShowDatePicker(false);
                    if (d) setFecha(d);
                  }}
                />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Nombre del evento</Text>
              <TextInput 
                style={styles.input} 
                value={nombre} 
                onChangeText={setNombre} 
                placeholder="Ej. Feria"
              />
            </View>
          </View>

          <View style={styles.formRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Entrada</Text>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowTimeEntrada(true)}>
                <Ionicons name="time-outline" size={18} color="#374151" />
                <Text style={styles.dateBtnText}>
                  {horaEntrada.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                </Text>
              </TouchableOpacity>
              {showTimeEntrada && (
                <DateTimePicker
                  value={horaEntrada}
                  mode="time"
                  display="default"
                  onChange={(e, d) => {
                    setShowTimeEntrada(false);
                    if (d) setHoraEntrada(d);
                  }}
                />
              )}
            </View>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Salida</Text>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowTimeSalida(true)}>
                <Ionicons name="time-outline" size={18} color="#374151" />
                <Text style={styles.dateBtnText}>
                  {horaSalida.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                </Text>
              </TouchableOpacity>
              {showTimeSalida && (
                <DateTimePicker
                  value={horaSalida}
                  mode="time"
                  display="default"
                  onChange={(e, d) => {
                    setShowTimeSalida(false);
                    if (d) setHoraSalida(d);
                  }}
                />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Tarifa ($)</Text>
              <TextInput 
                style={styles.input} 
                value={tarifa} 
                onChangeText={setTarifa} 
                keyboardType="numeric"
                placeholder="0"
              />
            </View>
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Programar</Text>}
          </TouchableOpacity>

          <View style={styles.divider} />
          
          <Text style={styles.listTitle}>Eventos Programados</Text>
          {loading && excepciones.length === 0 ? (
             <ActivityIndicator size="small" color="#4CAF50" />
          ) : excepciones.length === 0 ? (
            <Text style={styles.emptyText}>No hay eventos programados.</Text>
          ) : (
            <View style={{ maxHeight: 200 }}>
              {excepciones.map(exc => (
                <View key={exc.id} style={styles.excRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.excDate}>{formatFecha(exc.fecha)}</Text>
                    <Text style={styles.excName}>{exc.nombre}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.excTime}>{exc.horaEntrada} - {exc.horaSalida}</Text>
                    <Text style={styles.excTarifa}>${Number(exc.tarifa).toLocaleString()}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(exc.id)} style={styles.deleteBtn}>
                    <Ionicons name="trash" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '90%'
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827'
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20
  },
  closeBtn: {
    padding: 4
  },
  formRow: {
    flexDirection: 'row',
    marginBottom: 16
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827'
  },
  dateBtn: {
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
    marginLeft: 6,
    fontSize: 14,
    color: '#111827'
  },
  saveBtn: {
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold'
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 20
  },
  listTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12
  },
  emptyText: {
    color: '#6b7280',
    fontStyle: 'italic',
    textAlign: 'center'
  },
  excRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6'
  },
  excDate: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111827',
    textTransform: 'capitalize'
  },
  excName: {
    fontSize: 12,
    color: '#6b7280'
  },
  excTime: {
    fontSize: 13,
    color: '#374151'
  },
  excTarifa: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#10b981'
  },
  deleteBtn: {
    padding: 8
  }
});
