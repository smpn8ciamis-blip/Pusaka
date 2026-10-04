export type TaxType = 'pph21' | 'pph22' | 'pph23' | 'ppn' | 'none';

export interface WeekendShiftRate {
  id: string;
  position_type: string;
  daily_rate: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface WeekendShiftPayment {
  id: string;
  batch_id: string;
  worker_name: string;
  position_type: string;
  start_date: string;
  end_date: string;
  shift_count: number;
  daily_rate: number;
  gross_amount: number;
  tax_amount: number;
  net_amount: number;
  notes: string | null;
  created_at: string;
}

export interface WeekendShiftBatch {
  id: string;
  batch_number: string;
  receipt_date: string;
  job_title: string;
  description: string | null;
  total_gross: number;
  total_tax: number;
  total_net: number;
  tax_rate: number;
  tax_type: TaxType;
  shift_type: string;
  created_by: string;
  created_at: string;
  weekend_shift_payments?: WeekendShiftPayment[];
}

export interface SchoolSettings {
  school_name?: string;
  school_address?: string;
  city?: string;
  headmaster_name?: string;
  headmaster_nip?: string;
  headmaster_position?: string;
  bendahara_name?: string;
  bendahara_nip?: string;
  wakasek_sarpras_teacher_id?: string;
}

export const TAX_TYPE_LABELS: Record<TaxType, string> = {
  pph21: 'PPh 21',
  pph22: 'PPh 22',
  pph23: 'PPh 23',
  ppn: 'PPN',
  none: 'Tanpa Pajak',
};
