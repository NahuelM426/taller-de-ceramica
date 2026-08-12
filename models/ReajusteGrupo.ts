export interface ReajusteGrupo {
  id: number;
  grupo_id: number;
  fecha_origen: string;
  fecha_destino: string;
  fecha_inicio_anterior: string | null;
  fecha_inicio_nueva: string;
  fecha_hasta: string;
  agenda_anterior: string;
  agenda_generada: string;
  creado_en: string;
  deshecho_en: string | null;
}
