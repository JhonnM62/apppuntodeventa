import api from './api';

export interface Cargo {
  IDcargo: string;
  nombre: string;
  // Tarifas por día de la semana
  tarifaLunes?: number;
  horaEntradaLunes?: string;
  horaSalidaLunes?: string;
  tarifaMartes?: number;
  horaEntradaMartes?: string;
  horaSalidaMartes?: string;
  tarifaMiercoles?: number;
  horaEntradaMiercoles?: string;
  horaSalidaMiercoles?: string;
  tarifaJueves?: number;
  horaEntradaJueves?: string;
  horaSalidaJueves?: string;
  tarifaViernes?: number;
  horaEntradaViernes?: string;
  horaSalidaViernes?: string;
  tarifaSabado?: number;
  horaEntradaSabado?: string;
  horaSalidaSabado?: string;
  tarifaDomingo?: number;
  horaEntradaDomingo?: string;
  horaSalidaDomingo?: string;
  // Descuento si el empleado cena en el turno
  descuentoCena?: number;
  // Duración del descanso en minutos (0 = sin descanso)
  duracionDescansoMinutos?: number;
  createdAt: string;
  updatedAt: string;
}

export const DIAS_SEMANA = [
  { key: 'tarifaLunes',      label: 'Lunes' },
  { key: 'tarifaMartes',     label: 'Martes' },
  { key: 'tarifaMiercoles',  label: 'Miércoles' },
  { key: 'tarifaJueves',     label: 'Jueves' },
  { key: 'tarifaViernes',    label: 'Viernes' },
  { key: 'tarifaSabado',     label: 'Sábado' },
  { key: 'tarifaDomingo',    label: 'Domingo' },
] as const;

export type DiaKey = typeof DIAS_SEMANA[number]['key'];

export const getCargos = async () => {
  const { data } = await api.get('/cargos');
  return data;
};

export const getCargoById = async (id: string) => {
  const { data } = await api.get(`/cargos/${id}`);
  return data;
};

export const createCargo = async (cargo: Partial<Cargo>) => {
  const { data } = await api.post('/cargos', cargo);
  return data;
};

export const updateCargo = async (id: string, cargo: Partial<Cargo>) => {
  const { data } = await api.patch(`/cargos/${id}`, cargo);
  return data;
};

export const deleteCargo = async (id: string) => {
  const { data } = await api.delete(`/cargos/${id}`);
  return data;
};

export interface ExcepcionHorarioCargo {
  id: string;
  cargoId: string;
  fecha: string;
  nombre: string;
  tarifa: string | number;
  horaEntrada: string;
  horaSalida: string;
  createdAt: string;
}

export interface CreateExcepcionHorarioDto {
  cargoId: string;
  fecha: string;
  nombre: string;
  tarifa: number;
  horaEntrada: string;
  horaSalida: string;
}

export const getExcepcionesPorCargo = async (cargoId: string) => {
  const { data } = await api.get(`/cargos/excepcion-horario/${cargoId}`);
  return data;
};

export const createExcepcionHorario = async (dto: CreateExcepcionHorarioDto) => {
  const { data } = await api.post('/cargos/excepcion-horario', dto);
  return data;
};

export const deleteExcepcionHorario = async (id: string) => {
  const { data } = await api.delete(`/cargos/excepcion-horario/${id}`);
  return data;
};
