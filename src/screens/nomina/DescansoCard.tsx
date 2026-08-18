import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../components/ui/text';
import { iniciarDescanso, terminarDescanso } from '../../services/nomina.service';
import { useCustomAlert } from '../../context/CustomAlertContext';

interface DescansoCardProps {
  turnoId: string;
  horaEntrada: string;
  duracionMinutos: number;      // from cargo
  cargo: any;                   // full cargo object with horaEntrada/Salida per day
  inicioDescanso?: string | null;
  finDescanso?: string | null;
  onDescansoChange: (updated: { inicioDescanso: string | null; finDescanso: string | null }) => void;
}

// Helpers
const DAY_FIELD_MAP: Record<number, { entrada: string; salida: string }> = {
  0: { entrada: 'horaEntradaDomingo',   salida: 'horaSalidaDomingo' },
  1: { entrada: 'horaEntradaLunes',     salida: 'horaSalidaLunes' },
  2: { entrada: 'horaEntradaMartes',    salida: 'horaSalidaMartes' },
  3: { entrada: 'horaEntradaMiercoles', salida: 'horaSalidaMiercoles' },
  4: { entrada: 'horaEntradaJueves',    salida: 'horaSalidaJueves' },
  5: { entrada: 'horaEntradaViernes',   salida: 'horaSalidaViernes' },
  6: { entrada: 'horaEntradaSabado',    salida: 'horaSalidaSabado' },
};

const parseTimeStr = (t: string): number | null => {
  const match = t?.trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM|am|pm))?$/);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const p = match[3]?.toUpperCase();
  if (p === 'PM' && h < 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  return h * 60 + m;
};

const formatMinSec = (totalSec: number): string => {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const formatTime12h = (date: Date): string => {
  return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
};

export default function DescansoCard({
  turnoId, horaEntrada, duracionMinutos, cargo,
  inicioDescanso: inicioIni, finDescanso: finIni,
  onDescansoChange,
}: DescansoCardProps) {
  const { showAlert } = useCustomAlert();
  const [saving, setSaving] = useState(false);
  const [inicio, setInicio] = useState<Date | null>(inicioIni ? new Date(inicioIni) : null);
  const [fin, setFin]       = useState<Date | null>(finIni    ? new Date(finIni)    : null);
  const [now, setNow]       = useState(new Date());
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Live clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Pulse animation on "EN DESCANSO"
  useEffect(() => {
    if (inicio && !fin) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.04, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [inicio, fin]);

  // Compute suggested break start (midpoint of shift)
  const suggestedStart = (() => {
    if (!cargo) return null;
    const dia = new Date().getDay();
    const fields = DAY_FIELD_MAP[dia];
    const entradaMin = parseTimeStr(cargo[fields.entrada]);
    const salidaMin  = parseTimeStr(cargo[fields.salida]);
    if (entradaMin === null || salidaMin === null) return null;
    const turnoMin  = salidaMin > entradaMin ? salidaMin - entradaMin : salidaMin + 1440 - entradaMin;
    const midMin    = entradaMin + Math.floor(turnoMin / 2);
    const base = new Date(horaEntrada);
    // Use calendar date of entrada + midpoint hour/min in UTC (server stores UTC wall-clock)
    const suggested = new Date(base);
    suggested.setUTCHours(Math.floor(midMin / 60) % 24, midMin % 60, 0, 0);
    return suggested;
  })();

  const suggestedEnd = suggestedStart
    ? new Date(suggestedStart.getTime() + duracionMinutos * 60 * 1000)
    : null;

  // Seconds remaining in break
  const secsRemaining = (() => {
    if (!inicio || fin) return null;
    const elapsed = Math.floor((now.getTime() - inicio.getTime()) / 1000);
    return Math.max(0, duracionMinutos * 60 - elapsed);
  })();

  const isOvertime = secsRemaining === 0 && inicio && !fin;

  const handleIniciar = async () => {
    setSaving(true);
    try {
      const res = await iniciarDescanso(turnoId);
      const newInicio = new Date(res.data.inicioDescanso);
      setInicio(newInicio);
      onDescansoChange({ inicioDescanso: res.data.inicioDescanso, finDescanso: null });
    } catch (e: any) {
      showAlert({ type: 'error', title: 'Error', message: e?.response?.data?.message || 'No se pudo iniciar el descanso' });
    } finally { setSaving(false); }
  };

  const handleTerminar = async () => {
    setSaving(true);
    try {
      const res = await terminarDescanso(turnoId);
      const newFin = new Date(res.data.finDescanso);
      setFin(newFin);
      onDescansoChange({ inicioDescanso: res.data.inicioDescanso, finDescanso: res.data.finDescanso });
    } catch (e: any) {
      showAlert({ type: 'error', title: 'Error', message: e?.response?.data?.message || 'No se pudo terminar el descanso' });
    } finally { setSaving(false); }
  };

  // ── STATE C: Completed ──────────────────────────────────
  if (inicio && fin) {
    const durReal = Math.floor((fin.getTime() - inicio.getTime()) / 1000);
    const allowedSeconds = duracionMinutos * 60;
    const isOvertimeCompleted = allowedSeconds > 0 && durReal > allowedSeconds;
    const extraTime = durReal - allowedSeconds;

    return (
      <View style={[styles.card, isOvertimeCompleted ? { backgroundColor: '#fee2e2', borderColor: '#fecaca', borderWidth: 1.5 } : styles.cardCompleted]}>
        <View style={styles.headerRow}>
          <Ionicons name={isOvertimeCompleted ? "warning" : "checkmark-circle"} size={22} color={isOvertimeCompleted ? "#dc2626" : "#059669"} />
          <Text style={[styles.cardTitle, { color: isOvertimeCompleted ? '#dc2626' : '#059669' }]}>
            {isOvertimeCompleted ? `  Descanso Completado (+${formatMinSec(extraTime)})` : "  Descanso Completado ✅"}
          </Text>
        </View>
        <Text style={[styles.completedText, isOvertimeCompleted && { color: '#991b1b' }]}>
          {formatTime12h(inicio)}  →  {formatTime12h(fin)}  •  Total: {formatMinSec(durReal)}
        </Text>
      </View>
    );
  }

  // ── STATE B: In progress ─────────────────────────────────
  if (inicio && !fin) {
    const regresoEstimado = new Date(inicio.getTime() + duracionMinutos * 60 * 1000);
    return (
      <Animated.View style={[styles.card, styles.cardActive, { transform: [{ scale: pulseAnim }] }]}>
        <View style={styles.headerRow}>
          <Text style={styles.activeBadge}>🟠  EN DESCANSO</Text>
        </View>
        <View style={styles.timesRow}>
          <View style={styles.timeItem}>
            <Text style={styles.timeLabel}>Inicio</Text>
            <Text style={styles.timeValue}>{formatTime12h(inicio)}</Text>
          </View>
          <Ionicons name="arrow-forward" size={16} color="#92400e" style={{ marginTop: 14 }} />
          <View style={styles.timeItem}>
            <Text style={styles.timeLabel}>Regreso estimado</Text>
            <Text style={styles.timeValue}>{formatTime12h(regresoEstimado)}</Text>
          </View>
        </View>

        <View style={[styles.timerBox, isOvertime && styles.timerBoxOvertime]}>
          <Ionicons name="timer-outline" size={20} color={isOvertime ? '#ef4444' : '#92400e'} />
          <Text style={[styles.timerText, isOvertime && styles.timerTextOvertime]}>
            {isOvertime ? `¡Agotado! (+${formatMinSec(Math.floor((now.getTime() - inicio.getTime()) / 1000) - duracionMinutos * 60)})` : formatMinSec(secsRemaining!)}
          </Text>
          {!isOvertime && <Text style={styles.timerSub}>restante</Text>}
        </View>

        <TouchableOpacity
          style={[styles.btn, styles.btnOrange, saving && styles.btnDisabled]}
          onPress={handleTerminar}
          disabled={saving}
        >
          <Ionicons name="stop-circle-outline" size={18} color="#fff" />
          <Text style={styles.btnText}>{saving ? 'Guardando…' : 'Terminar Descanso'}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // ── STATE A: Waiting ─────────────────────────────────────
  const minsLabel = duracionMinutos >= 60
    ? `${duracionMinutos / 60} hora${duracionMinutos > 60 ? 's' : ''}`
    : `${duracionMinutos} minutos`;

  let suggestedStr = null;
  let remainingStr = null;

  if (cargo?.horaSugeridaDescanso) {
    const match = cargo.horaSugeridaDescanso.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      const d = new Date();
      d.setHours(parseInt(match[1], 10), parseInt(match[2], 10), 0, 0);
      suggestedStr = formatTime12h(d);
      
      const diffSecs = Math.floor((d.getTime() - now.getTime()) / 1000);
      if (diffSecs > 0) {
        const h = Math.floor(diffSecs / 3600);
        const m = Math.floor((diffSecs % 3600) / 60);
        if (h > 0) {
          remainingStr = `Falta${h > 1 ? 'n' : ''} ${h}h ${m}m`;
        } else {
          remainingStr = `Faltan ${m} min`;
        }
      }
    } else {
      suggestedStr = cargo.horaSugeridaDescanso;
    }
  }

  return (
    <View style={[styles.card, styles.cardWaiting]}>
      <View style={styles.headerRow}>
        <Text style={styles.waitingTitle}>☕  Tiempo de Descanso</Text>
      </View>

      <View style={styles.timesRow}>
        <View style={styles.timeItem}>
          <Text style={styles.timeLabel}>Duración</Text>
          <Text style={[styles.timeValue, { color: '#92400e' }]}>{minsLabel}</Text>
        </View>
        {suggestedStr && (
          <View style={styles.timeItem}>
            <Text style={styles.timeLabel}>Sugerido</Text>
            <Text style={[styles.timeValue, { color: '#0d9488' }]}>{suggestedStr}</Text>
            {remainingStr && (
              <Text style={{ fontSize: 11, color: '#0f766e', marginTop: 2, fontWeight: '500' }}>
                {remainingStr}
              </Text>
            )}
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.btn, styles.btnGreen, saving && styles.btnDisabled]}
        onPress={handleIniciar}
        disabled={saving}
      >
        <Ionicons name="cafe-outline" size={18} color="#fff" />
        <Text style={styles.btnText}>{saving ? 'Guardando…' : 'Iniciar Descanso'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  cardWaiting: {
    backgroundColor: '#fffbeb',
    borderWidth: 1.5,
    borderColor: '#fcd34d',
  },
  cardActive: {
    backgroundColor: '#fef3c7',
    borderWidth: 2,
    borderColor: '#f59e0b',
  },
  cardCompleted: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1.5,
    borderColor: '#6ee7b7',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  cardTitle:  { fontSize: 15, fontWeight: '700' },
  waitingTitle: { fontSize: 15, fontWeight: '700', color: '#92400e' },
  activeBadge:  { fontSize: 15, fontWeight: '800', color: '#b45309' },
  timesRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  timeItem:     { flex: 1 },
  timeLabel:    { fontSize: 11, color: '#78350f', fontWeight: '500', marginBottom: 2 },
  timeValue:    { fontSize: 13, fontWeight: '700', color: '#451a03' },
  timerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fde68a',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 14,
    gap: 6,
  },
  timerBoxOvertime: { backgroundColor: '#fee2e2' },
  timerText:        { fontSize: 32, fontWeight: '900', color: '#92400e', letterSpacing: 2 },
  timerTextOvertime:{ color: '#dc2626' },
  timerSub:         { fontSize: 12, color: '#92400e', alignSelf: 'flex-end', paddingBottom: 4 },
  countdownBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fde68a',
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
  },
  countdownText: { fontSize: 13, color: '#78350f', fontWeight: '600' },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 6,
  },
  btnGreen:    { backgroundColor: '#059669' },
  btnOrange:   { backgroundColor: '#ea580c' },
  btnDisabled: { opacity: 0.6 },
  btnText:     { color: '#fff', fontWeight: '700', fontSize: 15 },
  completedText: { fontSize: 13, color: '#065f46', fontWeight: '500', marginTop: 2 },
});
