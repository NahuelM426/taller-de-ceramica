export type CantidadClasesPagadas = 2 | 4;

export interface PagoAlumno {
  alumno_id: number;
  mes: string;
  pagado: number;
  clases_pagadas: CantidadClasesPagadas;
  clases_extra: number;
  clases_extra_usadas: number;
  clases_extra_disponibles: number;
  clases_extra_adeudadas: number;
  fecha_pago: string | null;
  actualizado_en: string;
}

export interface EstadoPagoAlumno extends PagoAlumno {
  alumno_nombre: string;
  grupo_nombre: string | null;
  grupo_color: string | null;
}
