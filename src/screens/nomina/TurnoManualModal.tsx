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

/** Returns "YYYY-MM-DD" using LOCAL timezone to avoid UTC shift */
const toLocalDateStr = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Enumerate all dates between startStr and endStr inclusive */
const dateRange = (startStr: string, endStr: string): string[] => {
  const result: string[] = [];
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end   = new Date(ey, em - 1, ed);
  if (start > end) return [];
  const cur = new Date(start);
  while (cur <= end) {
    result.push(toLocalDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return result;
};

export default function TurnoManualModal({ visible, empleado, onClose, onSuccess }: Props) {
  const { showAlert } = useCustomAlert();
  const [loading, setLoading] = useState(false);

  // ── Single‑date state ──────────────────────────────────────
  const [fechas, setFechas] = useState<string[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // ── Range state ────────────────────────────────────────────
  const [modeRange, setModeRange] = useState(false);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd,   setRangeEnd]   = useState('');
  const [showRangeStartPicker, setShowRangeStartPicker] = useState(false);
  const [showRangeEndPicker,   setShowRangeEndPicker]   = useState(false);
  const [rangeStartDate, setRangeStartDate] = useState(new Date());
  const [rangeEndDate,   setRangeEndDate]   = useState(new Date());

  // ── Times ──────────────────────────────────────────────────
  const [horaEntrada, setHoraEntrada] = useState(new Date());
  const [showTimeEntrada, setShowTimeEntrada] = useState(false);
  const [horaSalida, setHoraSalida] = useState<Date | null>(null);
  const [showTimeSalida, setShowTimeSalida] = useState(false);

  useEffect(() => {
    if (visible) {
      setFechas([]);
      setCurrentDate(new Date());
      setRangeStart('');
      setRangeEnd('');
      setModeRange(false);
      const now = new Date();
      now.setHours(8, 0, 0, 0);
      setHoraEntrada(now);
      setHoraSalida(null);
    }
  }, [visible]);

  // ── Add single date ─────────────────────────────────────────
  const handleAddFecha = () => {
    const dStr = toLocalDateStr(currentDate); // ← local date, no UTC shift
    if (!fechas.includes(dStr)) {
      setFechas([...fechas, dStr]);
    } else {
      showAlert({ type: 'warning', title: 'Atención', message: 'Esta fecha ya fue agregada' });
    }
  };

  // ── Add date range ──────────────────────────────────────────
  const handleAddRange = () => {
    if (!rangeStart || !rangeEnd) {
      showAlert({ type: 'warning', title: 'Atención', message: 'Selecciona la fecha de inicio y fin del rango' });
      return;
    }
    const days = dateRange(rangeStart, rangeEnd);
    if (days.length === 0) {
      showAlert({ type: 'warning', title: 'Atención', message: 'La fecha de inicio debe ser anterior o igual a la de fin' });
      return;
    }
    const nuevas = days.filter(d => !fechas.includes(d));
    if (nuevas.length === 0) {
      showAlert({ type: 'warning', title: 'Atención', message: 'Todas las fechas del rango ya fueron agregadas' });
      return;
    }
    setFechas([...fechas, ...nuevas].sort());
    showAlert({ type: 'success', title: 'Fechas añadidas', message: `Se agregaron ${nuevas.length} día(s) al rango` });
  };

  const removeFecha = (f: string) => setFechas(fechas.filter(x => x !== f));

  const formatTimeStr = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const formatDateLabel = (d: Date) =>
    d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

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
      showAlert({ type: 'success', title: 'Éxito', message: `Se crearon ${fechas.length} turno(s) exitosamente` });
      onSuccess();
      onClose();
    } catch (e: any) {
      showAlert({ type: 'error', title: 'Error', message: e.response?.data?.message || 'Error al crear turnos' });
    } finally {
      setLoading(false);
    }
  };

  // ── Render web date input helper ────────────────────────────
  const WebDateInput = ({ value, onChange }: { value: string; onChange: (v: string) => void }) =>
    React.createElement('input', {
      type: 'date',
      value,
      onChange: (e: any) => { if (e.target.value) onChange(e.target.value); },
      style: styles.webInput,
    });

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

          {/* ── Mode tabs ────────────────────────────────────── */}
          <View style={styles.modeTabs}>
            <TouchableOpacity
              style={[styles.modeTab, !modeRange && styles.modeTabActive]}
              onPress={() => setModeRange(false)}
            >
              <Ionicons name="calendar-outline" size={14} color={!modeRange ? '#fff' : '#6b7280'} />
              <Text style={[styles.modeTabText, !modeRange && styles.modeTabTextActive]}>  Fecha Individual</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeTab, modeRange && styles.modeTabActive]}
              onPress={() => setModeRange(true)}
            >
              <Ionicons name="calendar" size={14} color={modeRange ? '#fff' : '#6b7280'} />
              <Text style={[styles.modeTabText, modeRange && styles.modeTabTextActive]}>  Rango de Fechas</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll}>

            {/* ── Single date ───────────────────────────────── */}
            {!modeRange && (
              <View style={styles.section}>
                <Text style={styles.label}>Seleccionar Día</Text>
                <View style={styles.row}>
                  {Platform.OS === 'web' ? (
                    <WebDateInput
                      value={toLocalDateStr(currentDate)}
                      onChange={(v) => setCurrentDate(new Date(v + 'T12:00:00'))}
                    />
                  ) : (
                    <>
                      <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
                        <Ionicons name="calendar-outline" size={18} color="#374151" />
                        <Text style={styles.dateBtnText}>{formatDateLabel(currentDate)}</Text>
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
              </View>
            )}

            {/* ── Date range ────────────────────────────────── */}
            {modeRange && (
              <View style={styles.section}>
                <Text style={styles.label}>Desde</Text>
                {Platform.OS === 'web' ? (
                  <WebDateInput value={rangeStart} onChange={setRangeStart} />
                ) : (
                  <>
                    <TouchableOpacity style={[styles.dateBtn, { marginBottom: 8 }]} onPress={() => setShowRangeStartPicker(true)}>
                      <Ionicons name="calendar-outline" size={18} color="#374151" />
                      <Text style={styles.dateBtnText}>{rangeStart || 'Seleccionar inicio...'}</Text>
                    </TouchableOpacity>
                    {showRangeStartPicker && (
                      <DateTimePicker
                        value={rangeStartDate}
                        mode="date"
                        display="default"
                        onChange={(e, date) => {
                          setShowRangeStartPicker(false);
                          if (date) {
                            setRangeStartDate(date);
                            setRangeStart(toLocalDateStr(date));
                          }
                        }}
                      />
                    )}
                  </>
                )}
                <Text style={[styles.label, { marginTop: 12 }]}>Hasta</Text>
                {Platform.OS === 'web' ? (
                  <WebDateInput value={rangeEnd} onChange={setRangeEnd} />
                ) : (
                  <>
                    <TouchableOpacity style={[styles.dateBtn, { marginBottom: 8 }]} onPress={() => setShowRangeEndPicker(true)}>
                      <Ionicons name="calendar-outline" size={18} color="#374151" />
                      <Text style={styles.dateBtnText}>{rangeEnd || 'Seleccionar fin...'}</Text>
                    </TouchableOpacity>
                    {showRangeEndPicker && (
                      <DateTimePicker
                        value={rangeEndDate}
                        mode="date"
                        display="default"
                        onChange={(e, date) => {
                          setShowRangeEndPicker(false);
                          if (date) {
                            setRangeEndDate(date);
                            setRangeEnd(toLocalDateStr(date));
                          }
                        }}
                      />
                    )}
                  </>
                )}
                <TouchableOpacity style={[styles.addBtn, { marginTop: 12, alignSelf: 'stretch', alignItems: 'center' }]} onPress={handleAddRange}>
                  <Text style={styles.addBtnText}>Agregar Rango</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── Badges ────────────────────────────────────── */}
            <View style={styles.badges}>
              {fechas.sort().map(f => (
                <View key={f} style={styles.badge}>
                  <Text style={styles.badgeText}>{f}</Text>
                  <TouchableOpacity onPress={() => removeFecha(f)}>
                    <Ionicons name="close-circle" size={16} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}
              {fechas.length === 0 && <Text style={styles.helperText}>No has agregado ninguna fecha</Text>}
              {fechas.length > 0 && (
                <TouchableOpacity onPress={() => setFechas([])} style={styles.clearAllBtn}>
                  <Text style={styles.clearAllText}>Limpiar todas</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* ── Entry time ──────────────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.label}>Hora de Entrada (Para todos los días)</Text>
              {Platform.OS === 'web' ? (
                React.createElement('input', {
                  type: 'time',
                  value: horaEntrada.toTimeString().slice(0, 5),
                  onChange: (e: any) => {
                    if (e.target.value) {
                      const [h, m] = e.target.value.split(':');
                      const d = new Date(); d.setHours(Number(h), Number(m), 0, 0);
                      setHoraEntrada(d);
                    }
                  },
                  style: styles.webInput,
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

            {/* ── Exit time ───────────────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.label}>Hora de Salida (Opcional)</Text>
              {Platform.OS === 'web' ? (
                React.createElement('input', {
                  type: 'time',
                  value: horaSalida ? horaSalida.toTimeString().slice(0, 5) : '',
                  onChange: (e: any) => {
                    if (e.target.value) {
                      const [h, m] = e.target.value.split(':');
                      const d = new Date(); d.setHours(Number(h), Number(m), 0, 0);
                      setHoraSalida(d);
                    } else {
                      setHoraSalida(null);
                    }
                  },
                  style: styles.webInput,
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
                    <TouchableOpacity onPress={() => setHoraSalida(null)} style={{ marginTop: 8 }}>
                      <Text style={{ color: '#ef4444', fontSize: 12 }}>Limpiar Hora de Salida (Dejar Activo)</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>

            <Button onPress={handleSave} loading={loading} style={{ marginTop: 20 }}>
              Guardar Turnos ({fechas.length})
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
    maxHeight: '92%',
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
    marginBottom: 16,
  },
  modeTabs: {
    flexDirection: 'row',
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    padding: 4,
    marginBottom: 16,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 6,
  },
  modeTabActive: {
    backgroundColor: '#2563eb',
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  modeTabTextActive: {
    color: '#fff',
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
    width: '100%',
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
    marginTop: 4,
    marginBottom: 20,
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
  },
  clearAllBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: '#fef2f2',
  },
  clearAllText: {
    fontSize: 12,
    color: '#ef4444',
  },
});
