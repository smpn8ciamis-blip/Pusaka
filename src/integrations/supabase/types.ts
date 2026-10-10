export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      academic_years: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          school_id: string | null
          updated_at: string
          year: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          school_id?: string | null
          updated_at?: string
          year: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          school_id?: string | null
          updated_at?: string
          year?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      account_lock_settings: {
        Row: {
          created_at: string
          id: string
          is_locked: boolean
          lock_message: string | null
          locked_at: string | null
          locked_by: string | null
          school_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_locked?: boolean
          lock_message?: string | null
          locked_at?: string | null
          locked_by?: string | null
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_locked?: boolean
          lock_message?: string | null
          locked_at?: string | null
          locked_by?: string | null
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_lock_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      activities: {
        Row: {
          activity_type: string
          attachment_url: string | null
          created_at: string
          created_by: string
          description: string | null
          end_date: string | null
          id: string
          is_active: boolean
          location: string | null
          name: string
          school_id: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          activity_type: string
          attachment_url?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          school_id?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          activity_type?: string
          attachment_url?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          school_id?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_permissions: {
        Row: {
          activity_id: string
          created_at: string
          id: string
          parent_name: string | null
          parent_response: string | null
          parent_signature: string | null
          response_date: string | null
          school_id: string | null
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          id?: string
          parent_name?: string | null
          parent_response?: string | null
          parent_signature?: string | null
          response_date?: string | null
          school_id?: string | null
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          id?: string
          parent_name?: string | null
          parent_response?: string | null
          parent_signature?: string | null
          response_date?: string | null
          school_id?: string | null
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_permissions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_permissions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_permissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          content: string
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          school_id: string | null
          target_audience: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          school_id?: string | null
          target_audience?: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          school_id?: string | null
          target_audience?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      app_versions: {
        Row: {
          created_at: string
          id: string
          is_current: boolean
          release_date: string
          revision: string
          version: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_current?: boolean
          release_date?: string
          revision: string
          version: string
        }
        Update: {
          created_at?: string
          id?: string
          is_current?: boolean
          release_date?: string
          revision?: string
          version?: string
        }
        Relationships: []
      }
      assignment_letter_manual_executors: {
        Row: {
          assignment_letter_id: string
          created_at: string
          full_name: string
          id: string
          jabatan: string | null
          nip: string | null
          pangkat_golongan: string | null
          school_id: string | null
        }
        Insert: {
          assignment_letter_id: string
          created_at?: string
          full_name: string
          id?: string
          jabatan?: string | null
          nip?: string | null
          pangkat_golongan?: string | null
          school_id?: string | null
        }
        Update: {
          assignment_letter_id?: string
          created_at?: string
          full_name?: string
          id?: string
          jabatan?: string | null
          nip?: string | null
          pangkat_golongan?: string | null
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_letter_manual_executors_assignment_letter_id_fkey"
            columns: ["assignment_letter_id"]
            isOneToOne: false
            referencedRelation: "assignment_letters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_letter_manual_executors_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_letter_teachers: {
        Row: {
          assignment_letter_id: string
          created_at: string
          id: string
          school_id: string | null
          teacher_id: string
        }
        Insert: {
          assignment_letter_id: string
          created_at?: string
          id?: string
          school_id?: string | null
          teacher_id: string
        }
        Update: {
          assignment_letter_id?: string
          created_at?: string
          id?: string
          school_id?: string | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_letter_teachers_assignment_letter_id_fkey"
            columns: ["assignment_letter_id"]
            isOneToOne: false
            referencedRelation: "assignment_letters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_letter_teachers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_letter_teachers_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_letters: {
        Row: {
          assignment_type: string
          created_at: string
          created_by: string
          dasar_surat_tugas: string | null
          description: string
          end_date: string
          id: string
          letter_date: string
          letter_number: string
          location: string
          school_id: string | null
          start_date: string
          tanggal_dasar_surat_tugas: string | null
          updated_at: string
        }
        Insert: {
          assignment_type: string
          created_at?: string
          created_by: string
          dasar_surat_tugas?: string | null
          description: string
          end_date: string
          id?: string
          letter_date?: string
          letter_number: string
          location: string
          school_id?: string | null
          start_date: string
          tanggal_dasar_surat_tugas?: string | null
          updated_at?: string
        }
        Update: {
          assignment_type?: string
          created_at?: string
          created_by?: string
          dasar_surat_tugas?: string | null
          description?: string
          end_date?: string
          id?: string
          letter_date?: string
          letter_number?: string
          location?: string
          school_id?: string | null
          start_date?: string
          tanggal_dasar_surat_tugas?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_letters_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          created_at: string | null
          created_by: string | null
          date: string
          id: string
          notes: string | null
          schedule_id: string | null
          school_id: string | null
          status: string
          student_id: string
          sched_academic_year: string | null
          sched_class_id: string | null
          sched_day_of_week: number | null
          sched_end_time: string | null
          sched_semester: number | null
          sched_start_time: string | null
          sched_subject: string | null
          sched_teacher_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          date: string
          id?: string
          notes?: string | null
          schedule_id: string
          school_id?: string | null
          status: string
          student_id: string
          sched_academic_year?: string | null
          sched_class_id?: string | null
          sched_day_of_week?: number | null
          sched_end_time?: string | null
          sched_semester?: number | null
          sched_start_time?: string | null
          sched_subject?: string | null
          sched_teacher_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          date?: string
          id?: string
          notes?: string | null
          schedule_id?: string
          school_id?: string | null
          status?: string
          student_id?: string
          sched_academic_year?: string | null
          sched_class_id?: string | null
          sched_day_of_week?: number | null
          sched_end_time?: string | null
          sched_semester?: number | null
          sched_start_time?: string | null
          sched_subject?: string | null
          sched_teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_day_settings: {
        Row: {
          day_name: string
          day_of_week: number
          id: string
          is_active: boolean
          school_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          day_name: string
          day_of_week: number
          id?: string
          is_active?: boolean
          school_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          day_name?: string
          day_of_week?: number
          id?: string
          is_active?: boolean
          school_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_day_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_audit_sk_settings: {
        Row: {
          bendahara_name: string | null
          bendahara_nip: string | null
          created_at: string
          created_by: string
          headmaster_name: string | null
          headmaster_nip: string | null
          headmaster_position: string | null
          id: string
          school_id: string | null
          sk_date: string | null
          sk_number: string | null
          sk_period_end_month: number | null
          sk_period_end_year: number | null
          sk_period_start_month: number | null
          sk_period_start_year: number | null
          updated_at: string
          year: number
        }
        Insert: {
          bendahara_name?: string | null
          bendahara_nip?: string | null
          created_at?: string
          created_by: string
          headmaster_name?: string | null
          headmaster_nip?: string | null
          headmaster_position?: string | null
          id?: string
          school_id?: string | null
          sk_date?: string | null
          sk_number?: string | null
          sk_period_end_month?: number | null
          sk_period_end_year?: number | null
          sk_period_start_month?: number | null
          sk_period_start_year?: number | null
          updated_at?: string
          year: number
        }
        Update: {
          bendahara_name?: string | null
          bendahara_nip?: string | null
          created_at?: string
          created_by?: string
          headmaster_name?: string | null
          headmaster_nip?: string | null
          headmaster_position?: string | null
          id?: string
          school_id?: string | null
          sk_date?: string | null
          sk_number?: string | null
          sk_period_end_month?: number | null
          sk_period_end_year?: number | null
          sk_period_start_month?: number | null
          sk_period_start_year?: number | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "cash_audit_sk_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_audits: {
        Row: {
          audit_date: string
          created_at: string
          created_by: string
          id: string
          keping_100: number
          keping_1000: number
          keping_200: number
          keping_500: number
          lembar_1000: number
          lembar_10000: number
          lembar_100000: number
          lembar_2000: number
          lembar_20000: number
          lembar_5000: number
          lembar_50000: number
          penjelasan_perbedaan: string | null
          saldo_bank: number
          saldo_buku: number | null
          school_id: string | null
          sk_date: string | null
          sk_number: string | null
          surat_berharga: number
          total_penerimaan: number
          total_pengeluaran: number
          updated_at: string
        }
        Insert: {
          audit_date?: string
          created_at?: string
          created_by: string
          id?: string
          keping_100?: number
          keping_1000?: number
          keping_200?: number
          keping_500?: number
          lembar_1000?: number
          lembar_10000?: number
          lembar_100000?: number
          lembar_2000?: number
          lembar_20000?: number
          lembar_5000?: number
          lembar_50000?: number
          penjelasan_perbedaan?: string | null
          saldo_bank?: number
          saldo_buku?: number | null
          school_id?: string | null
          sk_date?: string | null
          sk_number?: string | null
          surat_berharga?: number
          total_penerimaan?: number
          total_pengeluaran?: number
          updated_at?: string
        }
        Update: {
          audit_date?: string
          created_at?: string
          created_by?: string
          id?: string
          keping_100?: number
          keping_1000?: number
          keping_200?: number
          keping_500?: number
          lembar_1000?: number
          lembar_10000?: number
          lembar_100000?: number
          lembar_2000?: number
          lembar_20000?: number
          lembar_5000?: number
          lembar_50000?: number
          penjelasan_perbedaan?: string | null
          saldo_bank?: number
          saldo_buku?: number | null
          school_id?: string | null
          sk_date?: string | null
          sk_number?: string | null
          surat_berharga?: number
          total_penerimaan?: number
          total_pengeluaran?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_audits_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      cbt_exam_sessions: {
        Row: {
          attempt_number: number
          correct_count: number | null
          created_at: string | null
          end_time: string | null
          essay_score: number | null
          exam_id: string
          grading_status: string
          id: string
          last_activity_at: string | null
          pg_score: number | null
          school_id: string | null
          score: number | null
          start_time: string | null
          status: string | null
          student_id: string
          time_remaining_seconds: number | null
          user_id: string
          wrong_count: number | null
        }
        Insert: {
          attempt_number?: number
          correct_count?: number | null
          created_at?: string | null
          end_time?: string | null
          essay_score?: number | null
          exam_id: string
          grading_status?: string
          id?: string
          last_activity_at?: string | null
          pg_score?: number | null
          school_id?: string | null
          score?: number | null
          start_time?: string | null
          status?: string | null
          student_id: string
          time_remaining_seconds?: number | null
          user_id: string
          wrong_count?: number | null
        }
        Update: {
          attempt_number?: number
          correct_count?: number | null
          created_at?: string | null
          end_time?: string | null
          essay_score?: number | null
          exam_id?: string
          grading_status?: string
          id?: string
          last_activity_at?: string | null
          pg_score?: number | null
          school_id?: string | null
          score?: number | null
          start_time?: string | null
          status?: string | null
          student_id?: string
          time_remaining_seconds?: number | null
          user_id?: string
          wrong_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cbt_exam_sessions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "cbt_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cbt_exam_sessions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cbt_exam_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      cbt_exams: {
        Row: {
          academic_year: string
          allow_resume: boolean
          anti_cheat_enabled: boolean
          class_id: string | null
          class_ids: string[] | null
          created_at: string | null
          created_by: string
          duration_minutes: number
          end_datetime: string | null
          exam_token: string | null
          exam_type: string
          exit_token: string | null
          id: string
          instructions: string | null
          is_active: boolean | null
          max_attempts: number
          max_violations: number
          pass_score: number | null
          require_token: boolean
          school_id: string | null
          show_result_to_student: boolean | null
          shuffle_options: boolean | null
          shuffle_questions: boolean | null
          start_datetime: string | null
          subject: string
          teacher_id: string
          title: string
          total_questions: number
          updated_at: string | null
        }
        Insert: {
          academic_year: string
          allow_resume?: boolean
          anti_cheat_enabled?: boolean
          class_id?: string | null
          class_ids?: string[] | null
          created_at?: string | null
          created_by: string
          duration_minutes?: number
          end_datetime?: string | null
          exam_token?: string | null
          exam_type?: string
          exit_token?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          max_attempts?: number
          max_violations?: number
          pass_score?: number | null
          require_token?: boolean
          school_id?: string | null
          show_result_to_student?: boolean | null
          shuffle_options?: boolean | null
          shuffle_questions?: boolean | null
          start_datetime?: string | null
          subject: string
          teacher_id: string
          title: string
          total_questions?: number
          updated_at?: string | null
        }
        Update: {
          academic_year?: string
          allow_resume?: boolean
          anti_cheat_enabled?: boolean
          class_id?: string | null
          class_ids?: string[] | null
          created_at?: string | null
          created_by?: string
          duration_minutes?: number
          end_datetime?: string | null
          exam_token?: string | null
          exam_type?: string
          exit_token?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          max_attempts?: number
          max_violations?: number
          pass_score?: number | null
          require_token?: boolean
          school_id?: string | null
          show_result_to_student?: boolean | null
          shuffle_options?: boolean | null
          shuffle_questions?: boolean | null
          start_datetime?: string | null
          subject?: string
          teacher_id?: string
          title?: string
          total_questions?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cbt_exams_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cbt_exams_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      cbt_question_templates: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          questions: Json
          school_id: string | null
          subject: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          questions?: Json
          school_id?: string | null
          subject: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          questions?: Json
          school_id?: string | null
          subject?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      cbt_questions: {
        Row: {
          correct_answer: string
          created_at: string | null
          essay_answer_key: string | null
          exam_id: string
          id: string
          image_url: string | null
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          option_e: string | null
          points: number | null
          question_number: number
          question_text: string
          question_type: string
          school_id: string | null
        }
        Insert: {
          correct_answer: string
          created_at?: string | null
          essay_answer_key?: string | null
          exam_id: string
          id?: string
          image_url?: string | null
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          option_e?: string | null
          points?: number | null
          question_number: number
          question_text: string
          question_type?: string
          school_id?: string | null
        }
        Update: {
          correct_answer?: string
          created_at?: string | null
          essay_answer_key?: string | null
          exam_id?: string
          id?: string
          image_url?: string | null
          option_a?: string
          option_b?: string
          option_c?: string
          option_d?: string
          option_e?: string | null
          points?: number | null
          question_number?: number
          question_text?: string
          question_type?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cbt_questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "cbt_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cbt_questions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      cbt_session_violations: {
        Row: {
          created_at: string
          detail: string | null
          exam_id: string
          id: string
          session_id: string
          student_id: string
          violation_type: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          exam_id: string
          id?: string
          session_id: string
          student_id: string
          violation_type: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          exam_id?: string
          id?: string
          session_id?: string
          student_id?: string
          violation_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cbt_session_violations_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "cbt_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cbt_session_violations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cbt_exam_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      cbt_student_answers: {
        Row: {
          created_at: string | null
          essay_answer: string | null
          essay_score_given: number | null
          graded_at: string | null
          graded_by: string | null
          grader_note: string | null
          id: string
          is_correct: boolean | null
          question_id: string
          school_id: string | null
          selected_answer: string | null
          session_id: string
        }
        Insert: {
          created_at?: string | null
          essay_answer?: string | null
          essay_score_given?: number | null
          graded_at?: string | null
          graded_by?: string | null
          grader_note?: string | null
          id?: string
          is_correct?: boolean | null
          question_id: string
          school_id?: string | null
          selected_answer?: string | null
          session_id: string
        }
        Update: {
          created_at?: string | null
          essay_answer?: string | null
          essay_score_given?: number | null
          graded_at?: string | null
          graded_by?: string | null
          grader_note?: string | null
          id?: string
          is_correct?: boolean | null
          question_id?: string
          school_id?: string | null
          selected_answer?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cbt_student_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "cbt_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cbt_student_answers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cbt_student_answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cbt_exam_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      changelog_entries: {
        Row: {
          change_type: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          version: string
        }
        Insert: {
          change_type: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          version: string
        }
        Update: {
          change_type?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          version?: string
        }
        Relationships: []
      }
      classes: {
        Row: {
          academic_year: string
          created_at: string | null
          grade: number
          homeroom_teacher_id: string | null
          id: string
          name: string
          school_id: string | null
          updated_at: string | null
        }
        Insert: {
          academic_year: string
          created_at?: string | null
          grade: number
          homeroom_teacher_id?: string | null
          id?: string
          name: string
          school_id?: string | null
          updated_at?: string | null
        }
        Update: {
          academic_year?: string
          created_at?: string | null
          grade?: number
          homeroom_teacher_id?: string | null
          id?: string
          name?: string
          school_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_homeroom_teacher_id_fkey"
            columns: ["homeroom_teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          created_at: string
          description: string
          id: string
          is_anonymous: boolean
          reporter_contact: string | null
          reporter_name: string | null
          responded_by: string | null
          response_date: string | null
          response_notes: string | null
          school_id: string | null
          status: string
          title: string
          tracking_number: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          is_anonymous?: boolean
          reporter_contact?: string | null
          reporter_name?: string | null
          responded_by?: string | null
          response_date?: string | null
          response_notes?: string | null
          school_id?: string | null
          status?: string
          title: string
          tracking_number?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_anonymous?: boolean
          reporter_contact?: string | null
          reporter_name?: string | null
          responded_by?: string | null
          response_date?: string | null
          response_notes?: string | null
          school_id?: string | null
          status?: string
          title?: string
          tracking_number?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaints_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      disposisi_surat: {
        Row: {
          catatan: string | null
          created_at: string
          created_by: string
          id: string
          instruksi: string
          school_id: string | null
          status: string
          surat_masuk_id: string
          tanggal_disposisi: string
          tanggal_selesai: string | null
          tujuan_disposisi: string
          updated_at: string
        }
        Insert: {
          catatan?: string | null
          created_at?: string
          created_by: string
          id?: string
          instruksi: string
          school_id?: string | null
          status?: string
          surat_masuk_id: string
          tanggal_disposisi?: string
          tanggal_selesai?: string | null
          tujuan_disposisi: string
          updated_at?: string
        }
        Update: {
          catatan?: string | null
          created_at?: string
          created_by?: string
          id?: string
          instruksi?: string
          school_id?: string | null
          status?: string
          surat_masuk_id?: string
          tanggal_disposisi?: string
          tanggal_selesai?: string | null
          tujuan_disposisi?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disposisi_surat_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disposisi_surat_surat_masuk_id_fkey"
            columns: ["surat_masuk_id"]
            isOneToOne: false
            referencedRelation: "surat_masuk"
            referencedColumns: ["id"]
          },
        ]
      }
      extracurricular_honorariums: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          honorarium_amount: number
          id: string
          instructor_id: string
          net_amount: number
          payment_month: number
          payment_year: number
          receipt_date: string
          receipt_number: string
          school_id: string | null
          tax_amount: number
          tax_percentage: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          honorarium_amount?: number
          id?: string
          instructor_id: string
          net_amount?: number
          payment_month: number
          payment_year: number
          receipt_date?: string
          receipt_number: string
          school_id?: string | null
          tax_amount?: number
          tax_percentage?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          honorarium_amount?: number
          id?: string
          instructor_id?: string
          net_amount?: number
          payment_month?: number
          payment_year?: number
          receipt_date?: string
          receipt_number?: string
          school_id?: string | null
          tax_amount?: number
          tax_percentage?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "extracurricular_honorariums_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "extracurricular_instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracurricular_honorariums_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      extracurricular_instructors: {
        Row: {
          created_at: string
          extracurricular_type_id: string
          honor_amount: number
          id: string
          is_active: boolean
          jabatan: string | null
          name: string
          nip: string | null
          nuptk: string | null
          pangkat_golongan: string | null
          school_id: string | null
          tax_percentage: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          extracurricular_type_id: string
          honor_amount?: number
          id?: string
          is_active?: boolean
          jabatan?: string | null
          name: string
          nip?: string | null
          nuptk?: string | null
          pangkat_golongan?: string | null
          school_id?: string | null
          tax_percentage?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          extracurricular_type_id?: string
          honor_amount?: number
          id?: string
          is_active?: boolean
          jabatan?: string | null
          name?: string
          nip?: string | null
          nuptk?: string | null
          pangkat_golongan?: string | null
          school_id?: string | null
          tax_percentage?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "extracurricular_instructors_extracurricular_type_id_fkey"
            columns: ["extracurricular_type_id"]
            isOneToOne: false
            referencedRelation: "extracurricular_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracurricular_instructors_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      extracurricular_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          school_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "extracurricular_types_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      file_upload_requirements: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          file_type: string | null
          id: string
          is_active: boolean | null
          is_required: boolean | null
          max_file_size_mb: number | null
          name: string
          school_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          file_type?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          max_file_size_mb?: number | null
          name: string
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          file_type?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          max_file_size_mb?: number | null
          name?: string
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_upload_requirements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          created_at: string
          created_by: string
          final_grade: number | null
          id: string
          kuis: number | null
          praktik: number | null
          schedule_id: string | null
          school_id: string | null
          student_id: string
          tugas: number | null
          uas: number | null
          updated_at: string
          uts: number | null
          sched_academic_year: string | null
          sched_class_id: string | null
          sched_day_of_week: number | null
          sched_end_time: string | null
          sched_semester: number | null
          sched_start_time: string | null
          sched_subject: string | null
          sched_teacher_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          final_grade?: number | null
          id?: string
          kuis?: number | null
          praktik?: number | null
          schedule_id: string
          school_id?: string | null
          student_id: string
          tugas?: number | null
          uas?: number | null
          updated_at?: string
          uts?: number | null
          sched_academic_year?: string | null
          sched_class_id?: string | null
          sched_day_of_week?: number | null
          sched_end_time?: string | null
          sched_semester?: number | null
          sched_start_time?: string | null
          sched_subject?: string | null
          sched_teacher_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          final_grade?: number | null
          id?: string
          kuis?: number | null
          praktik?: number | null
          schedule_id?: string
          school_id?: string | null
          student_id?: string
          tugas?: number | null
          uas?: number | null
          updated_at?: string
          uts?: number | null
          sched_academic_year?: string | null
          sched_class_id?: string | null
          sched_day_of_week?: number | null
          sched_end_time?: string | null
          sched_semester?: number | null
          sched_start_time?: string | null
          sched_subject?: string | null
          sched_teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grades_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      graduation_announcement_settings: {
        Row: {
          close_datetime: string | null
          created_at: string
          id: string
          is_active: boolean | null
          message: string | null
          open_datetime: string | null
          school_id: string | null
          updated_at: string
        }
        Insert: {
          close_datetime?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          message?: string | null
          open_datetime?: string | null
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          close_datetime?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          message?: string | null
          open_datetime?: string | null
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "graduation_announcement_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      gtt_ptt_honorariums: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          honorarium_amount: number
          id: string
          net_amount: number
          payment_month: number
          payment_year: number
          receipt_date: string
          receipt_number: string
          school_id: string | null
          tax_amount: number
          tax_percentage: number
          teacher_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          honorarium_amount?: number
          id?: string
          net_amount?: number
          payment_month: number
          payment_year: number
          receipt_date?: string
          receipt_number: string
          school_id?: string | null
          tax_amount?: number
          tax_percentage?: number
          teacher_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          honorarium_amount?: number
          id?: string
          net_amount?: number
          payment_month?: number
          payment_year?: number
          receipt_date?: string
          receipt_number?: string
          school_id?: string | null
          tax_amount?: number
          tax_percentage?: number
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gtt_ptt_honorariums_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gtt_ptt_honorariums_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_book: {
        Row: {
          created_at: string
          departure_time: string | null
          id: string
          notes: string | null
          purpose: string
          recorded_by: string | null
          school_id: string | null
          updated_at: string
          visit_date: string
          visit_time: string | null
          visitor_institution: string | null
          visitor_name: string
          visitor_phone: string | null
        }
        Insert: {
          created_at?: string
          departure_time?: string | null
          id?: string
          notes?: string | null
          purpose: string
          recorded_by?: string | null
          school_id?: string | null
          updated_at?: string
          visit_date?: string
          visit_time?: string | null
          visitor_institution?: string | null
          visitor_name: string
          visitor_phone?: string | null
        }
        Update: {
          created_at?: string
          departure_time?: string | null
          id?: string
          notes?: string | null
          purpose?: string
          recorded_by?: string | null
          school_id?: string | null
          updated_at?: string
          visit_date?: string
          visit_time?: string | null
          visitor_institution?: string | null
          visitor_name?: string
          visitor_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_book_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      habit_journals: {
        Row: {
          activity_description: string
          created_at: string
          habit_number: number
          id: string
          journal_date: string
          reflection: string | null
          school_id: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          activity_description: string
          created_at?: string
          habit_number: number
          id?: string
          journal_date?: string
          reflection?: string | null
          school_id?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          activity_description?: string
          created_at?: string
          habit_number?: number
          id?: string
          journal_date?: string
          reflection?: string | null
          school_id?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_journals_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habit_journals_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      important_event_notes: {
        Row: {
          category: string
          created_at: string
          description: string
          event_date: string
          id: string
          school_id: string | null
          severity: string
          teacher_id: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description: string
          event_date?: string
          id?: string
          school_id?: string | null
          severity?: string
          teacher_id: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          event_date?: string
          id?: string
          school_id?: string | null
          severity?: string
          teacher_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "important_event_notes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "important_event_notes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      kode_kegiatan_labels: {
        Row: {
          created_at: string
          id: string
          keterangan: string
          kode: string
          program: string | null
          school_id: string | null
          sub_program: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          keterangan: string
          kode: string
          program?: string | null
          school_id?: string | null
          sub_program?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          keterangan?: string
          kode?: string
          program?: string | null
          school_id?: string | null
          sub_program?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kode_kegiatan_labels_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      kode_rekening_labels: {
        Row: {
          created_at: string
          id: string
          keterangan: string
          kode: string
          school_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          keterangan: string
          kode: string
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          keterangan?: string
          kode?: string
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kode_rekening_labels_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      letter_attachments: {
        Row: {
          assignment_letter_id: string | null
          captured_at: string | null
          created_at: string
          file_name: string | null
          file_path: string
          file_url: string
          id: string
          kind: string
          latitude: number | null
          letter_type: string
          location_name: string | null
          longitude: number | null
          mime_type: string | null
          notes: string | null
          official_travel_id: string | null
          school_id: string | null
          teacher_id: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          assignment_letter_id?: string | null
          captured_at?: string | null
          created_at?: string
          file_name?: string | null
          file_path: string
          file_url: string
          id?: string
          kind: string
          latitude?: number | null
          letter_type: string
          location_name?: string | null
          longitude?: number | null
          mime_type?: string | null
          notes?: string | null
          official_travel_id?: string | null
          school_id?: string | null
          teacher_id: string
          updated_at?: string
          uploaded_by?: string
        }
        Update: {
          assignment_letter_id?: string | null
          captured_at?: string | null
          created_at?: string
          file_name?: string | null
          file_path?: string
          file_url?: string
          id?: string
          kind?: string
          latitude?: number | null
          letter_type?: string
          location_name?: string | null
          longitude?: number | null
          mime_type?: string | null
          notes?: string | null
          official_travel_id?: string | null
          school_id?: string | null
          teacher_id?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "letter_attachments_assignment_letter_id_fkey"
            columns: ["assignment_letter_id"]
            isOneToOne: false
            referencedRelation: "assignment_letters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "letter_attachments_official_travel_id_fkey"
            columns: ["official_travel_id"]
            isOneToOne: false
            referencedRelation: "official_travel_letters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "letter_attachments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      login_popup_notifications: {
        Row: {
          created_at: string
          created_by: string
          end_date: string | null
          id: string
          is_active: boolean
          message: string
          notification_type: string
          school_id: string | null
          start_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          message: string
          notification_type?: string
          school_id?: string | null
          start_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          message?: string
          notification_type?: string
          school_id?: string | null
          start_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "login_popup_notifications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_backup_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      narasumber_honorariums: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          honorarium_amount: number
          id: string
          instructor_id: string
          net_amount: number
          payment_month: number
          payment_year: number
          receipt_date: string
          receipt_number: string
          school_id: string | null
          tax_amount: number
          tax_percentage: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          honorarium_amount?: number
          id?: string
          instructor_id: string
          net_amount?: number
          payment_month: number
          payment_year: number
          receipt_date?: string
          receipt_number: string
          school_id?: string | null
          tax_amount?: number
          tax_percentage?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          honorarium_amount?: number
          id?: string
          instructor_id?: string
          net_amount?: number
          payment_month?: number
          payment_year?: number
          receipt_date?: string
          receipt_number?: string
          school_id?: string | null
          tax_amount?: number
          tax_percentage?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "narasumber_honorariums_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "narasumber_instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "narasumber_honorariums_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      narasumber_instructors: {
        Row: {
          created_at: string
          honor_amount: number
          id: string
          is_active: boolean
          jabatan: string | null
          name: string
          narasumber_type_id: string
          nip: string | null
          nuptk: string | null
          pangkat_golongan: string | null
          school_id: string | null
          tax_percentage: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          honor_amount?: number
          id?: string
          is_active?: boolean
          jabatan?: string | null
          name: string
          narasumber_type_id: string
          nip?: string | null
          nuptk?: string | null
          pangkat_golongan?: string | null
          school_id?: string | null
          tax_percentage?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          honor_amount?: number
          id?: string
          is_active?: boolean
          jabatan?: string | null
          name?: string
          narasumber_type_id?: string
          nip?: string | null
          nuptk?: string | null
          pangkat_golongan?: string | null
          school_id?: string | null
          tax_percentage?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "narasumber_instructors_narasumber_type_id_fkey"
            columns: ["narasumber_type_id"]
            isOneToOne: false
            referencedRelation: "narasumber_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "narasumber_instructors_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      narasumber_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          school_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "narasumber_types_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      nedelcis_hub_buttons: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          open_in_new_tab: boolean
          schedule_end: string | null
          schedule_start: string | null
          school_id: string
          sort_order: number
          updated_at: string
          url: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          open_in_new_tab?: boolean
          schedule_end?: string | null
          schedule_start?: string | null
          school_id: string
          sort_order?: number
          updated_at?: string
          url: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          open_in_new_tab?: boolean
          schedule_end?: string | null
          schedule_start?: string | null
          school_id?: string
          sort_order?: number
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      nedelcis_hub_settings: {
        Row: {
          accent_color: string | null
          background_style: string | null
          created_at: string
          description: string | null
          id: string
          school_id: string
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          background_style?: string | null
          created_at?: string
          description?: string | null
          id?: string
          school_id: string
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          background_style?: string | null
          created_at?: string
          description?: string | null
          id?: string
          school_id?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          school_id: string | null
          student_id: string
          teacher_id: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          school_id?: string | null
          student_id: string
          teacher_id: string
          type?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          school_id?: string | null
          student_id?: string
          teacher_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_student"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_teacher"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      official_travel_followers: {
        Row: {
          created_at: string
          follower_type: string
          id: string
          manual_executor_jabatan: string | null
          manual_executor_name: string | null
          manual_executor_nip: string | null
          manual_executor_pangkat: string | null
          official_travel_id: string
          school_id: string | null
          student_id: string | null
          teacher_id: string | null
        }
        Insert: {
          created_at?: string
          follower_type: string
          id?: string
          manual_executor_jabatan?: string | null
          manual_executor_name?: string | null
          manual_executor_nip?: string | null
          manual_executor_pangkat?: string | null
          official_travel_id: string
          school_id?: string | null
          student_id?: string | null
          teacher_id?: string | null
        }
        Update: {
          created_at?: string
          follower_type?: string
          id?: string
          manual_executor_jabatan?: string | null
          manual_executor_name?: string | null
          manual_executor_nip?: string | null
          manual_executor_pangkat?: string | null
          official_travel_id?: string
          school_id?: string | null
          student_id?: string | null
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "official_travel_followers_official_travel_id_fkey"
            columns: ["official_travel_id"]
            isOneToOne: false
            referencedRelation: "official_travel_letters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "official_travel_followers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "official_travel_followers_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "official_travel_followers_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      official_travel_letters: {
        Row: {
          accommodation_budget: number | null
          assignment_letter_id: string | null
          created_at: string
          created_by: string
          departure_date: string
          destination: string
          id: string
          letter_date: string
          letter_number: string
          notes: string | null
          purpose: string
          return_date: string
          school_id: string | null
          transportation: string | null
          travel_budget: number | null
          updated_at: string
        }
        Insert: {
          accommodation_budget?: number | null
          assignment_letter_id?: string | null
          created_at?: string
          created_by: string
          departure_date: string
          destination: string
          id?: string
          letter_date?: string
          letter_number: string
          notes?: string | null
          purpose: string
          return_date: string
          school_id?: string | null
          transportation?: string | null
          travel_budget?: number | null
          updated_at?: string
        }
        Update: {
          accommodation_budget?: number | null
          assignment_letter_id?: string | null
          created_at?: string
          created_by?: string
          departure_date?: string
          destination?: string
          id?: string
          letter_date?: string
          letter_number?: string
          notes?: string | null
          purpose?: string
          return_date?: string
          school_id?: string | null
          transportation?: string | null
          travel_budget?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "official_travel_letters_assignment_letter_id_fkey"
            columns: ["assignment_letter_id"]
            isOneToOne: false
            referencedRelation: "assignment_letters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "official_travel_letters_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      official_travel_teachers: {
        Row: {
          created_at: string
          id: string
          official_travel_id: string
          school_id: string | null
          teacher_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          official_travel_id: string
          school_id?: string | null
          teacher_id: string
        }
        Update: {
          created_at?: string
          id?: string
          official_travel_id?: string
          school_id?: string | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "official_travel_teachers_official_travel_id_fkey"
            columns: ["official_travel_id"]
            isOneToOne: false
            referencedRelation: "official_travel_letters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "official_travel_teachers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "official_travel_teachers_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_receipts: {
        Row: {
          amount: number
          amount_text: string
          bendahara_name: string | null
          bendahara_nip: string | null
          created_at: string
          created_by: string
          description: string
          id: string
          is_spj: boolean
          official_travel_id: string
          payment_type: string
          receipt_date: string
          receipt_number: string
          recipient_name: string
          recipient_nip: string | null
          recipient_position: string | null
          school_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          amount_text: string
          bendahara_name?: string | null
          bendahara_nip?: string | null
          created_at?: string
          created_by: string
          description: string
          id?: string
          is_spj?: boolean
          official_travel_id: string
          payment_type?: string
          receipt_date?: string
          receipt_number: string
          recipient_name: string
          recipient_nip?: string | null
          recipient_position?: string | null
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          amount_text?: string
          bendahara_name?: string | null
          bendahara_nip?: string | null
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          is_spj?: boolean
          official_travel_id?: string
          payment_type?: string
          receipt_date?: string
          receipt_number?: string
          recipient_name?: string
          recipient_nip?: string | null
          recipient_position?: string | null
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipts_official_travel_id_fkey"
            columns: ["official_travel_id"]
            isOneToOne: false
            referencedRelation: "official_travel_letters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      polling_candidates: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          position_id: string
          school_id: string | null
          teacher_id: string
          updated_at: string
          vote_count: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          position_id: string
          school_id?: string | null
          teacher_id: string
          updated_at?: string
          vote_count?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          position_id?: string
          school_id?: string | null
          teacher_id?: string
          updated_at?: string
          vote_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "polling_candidates_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "polling_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polling_candidates_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polling_candidates_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      polling_positions: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean | null
          max_candidates: number | null
          name: string
          school_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          max_candidates?: number | null
          name: string
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          max_candidates?: number | null
          name?: string
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "polling_positions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      polling_sessions: {
        Row: {
          created_at: string
          created_by: string
          end_date: string
          id: string
          is_active: boolean | null
          name: string
          position_id: string
          school_id: string | null
          start_date: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          end_date: string
          id?: string
          is_active?: boolean | null
          name: string
          position_id: string
          school_id?: string | null
          start_date: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          end_date?: string
          id?: string
          is_active?: boolean | null
          name?: string
          position_id?: string
          school_id?: string | null
          start_date?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "polling_sessions_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "polling_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polling_sessions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      polling_votes: {
        Row: {
          candidate_id: string
          id: string
          school_id: string | null
          session_id: string
          voted_at: string
          voter_id: string
        }
        Insert: {
          candidate_id: string
          id?: string
          school_id?: string | null
          session_id: string
          voted_at?: string
          voter_id: string
        }
        Update: {
          candidate_id?: string
          id?: string
          school_id?: string | null
          session_id?: string
          voted_at?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "polling_votes_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "polling_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polling_votes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polling_votes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "polling_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_tautan_guru_buttons: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          open_in_new_tab: boolean
          schedule_end: string | null
          schedule_start: string | null
          school_id: string
          sort_order: number
          updated_at: string
          url: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          open_in_new_tab?: boolean
          schedule_end?: string | null
          schedule_start?: string | null
          school_id: string
          sort_order?: number
          updated_at?: string
          url: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          open_in_new_tab?: boolean
          schedule_end?: string | null
          schedule_start?: string | null
          school_id?: string
          sort_order?: number
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      portal_tautan_guru_settings: {
        Row: {
          accent_color: string | null
          background_style: string | null
          created_at: string
          description: string | null
          id: string
          school_id: string
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          background_style?: string | null
          created_at?: string
          description?: string | null
          id?: string
          school_id: string
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          background_style?: string | null
          created_at?: string
          description?: string | null
          id?: string
          school_id?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      processing_jobs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          progress: number | null
          result: string | null
          school_id: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          progress?: number | null
          result?: string | null
          school_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          progress?: number | null
          result?: string | null
          school_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name: string
          id: string
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      repository: {
        Row: {
          category: string
          created_at: string
          description: string | null
          file_type: string | null
          google_drive_link: string
          id: string
          school_id: string | null
          title: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          file_type?: string | null
          google_drive_link: string
          id?: string
          school_id?: string | null
          title: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          file_type?: string | null
          google_drive_link?: string
          id?: string
          school_id?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "repository_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      rfid_attendance: {
        Row: {
          check_in_at: string | null
          check_out_at: string | null
          created_at: string
          date: string
          face_verified: boolean
          id: string
          notes: string | null
          school_id: string | null
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          check_in_at?: string | null
          check_out_at?: string | null
          created_at?: string
          date?: string
          face_verified?: boolean
          id?: string
          notes?: string | null
          school_id?: string | null
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          check_in_at?: string | null
          check_out_at?: string | null
          created_at?: string
          date?: string
          face_verified?: boolean
          id?: string
          notes?: string | null
          school_id?: string | null
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfid_attendance_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfid_attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      rfid_attendance_settings: {
        Row: {
          check_in_end: string
          check_in_start: string
          check_out_end: string
          check_out_start: string
          created_at: string
          face_verification_enabled: boolean
          id: string
          is_active: boolean
          late_after: string
          late_violation_enabled: boolean
          late_violation_points: number
          school_id: string | null
          updated_at: string
        }
        Insert: {
          check_in_end?: string
          check_in_start?: string
          check_out_end?: string
          check_out_start?: string
          created_at?: string
          face_verification_enabled?: boolean
          id?: string
          is_active?: boolean
          late_after?: string
          late_violation_enabled?: boolean
          late_violation_points?: number
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          check_in_end?: string
          check_in_start?: string
          check_out_end?: string
          check_out_start?: string
          created_at?: string
          face_verification_enabled?: boolean
          id?: string
          is_active?: boolean
          late_after?: string
          late_violation_enabled?: boolean
          late_violation_points?: number
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfid_attendance_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      rkas_documents: {
        Row: {
          created_at: string
          created_by: string
          file_name: string
          file_url: string
          id: string
          month: number
          parsed_data: Json | null
          school_id: string | null
          status: string | null
          total_budget: number | null
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          created_by: string
          file_name: string
          file_url: string
          id?: string
          month: number
          parsed_data?: Json | null
          school_id?: string | null
          status?: string | null
          total_budget?: number | null
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          created_by?: string
          file_name?: string
          file_url?: string
          id?: string
          month?: number
          parsed_data?: Json | null
          school_id?: string | null
          status?: string | null
          total_budget?: number | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "rkas_documents_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      rkas_items: {
        Row: {
          activity_name: string
          category: string
          created_at: string
          description: string | null
          id: string
          kode_kegiatan: string | null
          kode_rekening: string | null
          main_category: string | null
          rkas_id: string
          school_id: string | null
          sub_category: string | null
          total_amount: number | null
          unit: string | null
          unit_price: number | null
          volume: number | null
        }
        Insert: {
          activity_name: string
          category: string
          created_at?: string
          description?: string | null
          id?: string
          kode_kegiatan?: string | null
          kode_rekening?: string | null
          main_category?: string | null
          rkas_id: string
          school_id?: string | null
          sub_category?: string | null
          total_amount?: number | null
          unit?: string | null
          unit_price?: number | null
          volume?: number | null
        }
        Update: {
          activity_name?: string
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          kode_kegiatan?: string | null
          kode_rekening?: string | null
          main_category?: string | null
          rkas_id?: string
          school_id?: string | null
          sub_category?: string | null
          total_amount?: number | null
          unit?: string | null
          unit_price?: number | null
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rkas_items_rkas_id_fkey"
            columns: ["rkas_id"]
            isOneToOne: false
            referencedRelation: "rkas_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rkas_items_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          academic_year: string
          class_id: string
          created_at: string | null
          day_of_week: number
          end_time: string
          id: string
          school_id: string | null
          semester: number | null
          start_time: string
          subject: string
          teacher_id: string
          updated_at: string | null
        }
        Insert: {
          academic_year: string
          class_id: string
          created_at?: string | null
          day_of_week: number
          end_time: string
          id?: string
          school_id?: string | null
          semester?: number | null
          start_time: string
          subject: string
          teacher_id: string
          updated_at?: string | null
        }
        Update: {
          academic_year?: string
          class_id?: string
          created_at?: string | null
          day_of_week?: number
          end_time?: string
          id?: string
          school_id?: string | null
          semester?: number | null
          start_time?: string
          subject?: string
          teacher_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedules_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      school_settings: {
        Row: {
          academic_year: string | null
          active_semester: number | null
          activity_permission_color: string | null
          activity_permission_text: string | null
          app_name: string | null
          bendahara_name: string | null
          bendahara_nip: string | null
          complaint_channel_color: string | null
          complaint_channel_text: string | null
          complaint_status_check_color: string | null
          complaint_status_check_text: string | null
          created_at: string
          district_font_size: number | null
          district_font_style: string | null
          district_line_spacing: number | null
          district_name: string | null
          enable_activity_permission: boolean | null
          enable_captcha: boolean
          enable_complaint_channel: boolean | null
          enable_complaint_status_check: boolean | null
          enable_graduation_check: boolean | null
          enable_student_status_check: boolean | null
          exam_card_settings: Json | null
          exam_name: string | null
          exam_schedule: Json | null
          graduation_check_color: string | null
          graduation_check_text: string | null
          header_font_size: number | null
          header_font_style: string | null
          headmaster_name: string
          headmaster_nip: string | null
          headmaster_position: string
          headmaster_signature_url: string | null
          id: string
          logo_height: number | null
          logo_position_x: number | null
          logo_position_y: number | null
          logo_url: string | null
          logo_width: number | null
          right_logo_height: number | null
          right_logo_position_x: number | null
          right_logo_position_y: number | null
          right_logo_url: string | null
          right_logo_width: number | null
          school_address: string | null
          school_id: string | null
          school_line_spacing: number | null
          school_name: string
          school_phone: string | null
          school_stamp_url: string | null
          show_address: boolean | null
          show_phone: boolean | null
          student_status_check_color: string | null
          student_status_check_text: string | null
          subheader_font_size: number | null
          teacher_upload_access_code: string | null
          updated_at: string
          wakasek_sarpras_teacher_id: string | null
          watermark_enabled: boolean | null
          watermark_opacity: number | null
          watermark_position: string | null
          watermark_size: number | null
          watermark_url: string | null
        }
        Insert: {
          academic_year?: string | null
          active_semester?: number | null
          activity_permission_color?: string | null
          activity_permission_text?: string | null
          app_name?: string | null
          bendahara_name?: string | null
          bendahara_nip?: string | null
          complaint_channel_color?: string | null
          complaint_channel_text?: string | null
          complaint_status_check_color?: string | null
          complaint_status_check_text?: string | null
          created_at?: string
          district_font_size?: number | null
          district_font_style?: string | null
          district_line_spacing?: number | null
          district_name?: string | null
          enable_activity_permission?: boolean | null
          enable_captcha?: boolean
          enable_complaint_channel?: boolean | null
          enable_complaint_status_check?: boolean | null
          enable_graduation_check?: boolean | null
          enable_student_status_check?: boolean | null
          exam_card_settings?: Json | null
          exam_name?: string | null
          exam_schedule?: Json | null
          graduation_check_color?: string | null
          graduation_check_text?: string | null
          header_font_size?: number | null
          header_font_style?: string | null
          headmaster_name: string
          headmaster_nip?: string | null
          headmaster_position?: string
          headmaster_signature_url?: string | null
          id?: string
          logo_height?: number | null
          logo_position_x?: number | null
          logo_position_y?: number | null
          logo_url?: string | null
          logo_width?: number | null
          right_logo_height?: number | null
          right_logo_position_x?: number | null
          right_logo_position_y?: number | null
          right_logo_url?: string | null
          right_logo_width?: number | null
          school_address?: string | null
          school_id?: string | null
          school_line_spacing?: number | null
          school_name?: string
          school_phone?: string | null
          school_stamp_url?: string | null
          show_address?: boolean | null
          show_phone?: boolean | null
          student_status_check_color?: string | null
          student_status_check_text?: string | null
          subheader_font_size?: number | null
          teacher_upload_access_code?: string | null
          updated_at?: string
          wakasek_sarpras_teacher_id?: string | null
          watermark_enabled?: boolean | null
          watermark_opacity?: number | null
          watermark_position?: string | null
          watermark_size?: number | null
          watermark_url?: string | null
        }
        Update: {
          academic_year?: string | null
          active_semester?: number | null
          activity_permission_color?: string | null
          activity_permission_text?: string | null
          app_name?: string | null
          bendahara_name?: string | null
          bendahara_nip?: string | null
          complaint_channel_color?: string | null
          complaint_channel_text?: string | null
          complaint_status_check_color?: string | null
          complaint_status_check_text?: string | null
          created_at?: string
          district_font_size?: number | null
          district_font_style?: string | null
          district_line_spacing?: number | null
          district_name?: string | null
          enable_activity_permission?: boolean | null
          enable_captcha?: boolean
          enable_complaint_channel?: boolean | null
          enable_complaint_status_check?: boolean | null
          enable_graduation_check?: boolean | null
          enable_student_status_check?: boolean | null
          exam_card_settings?: Json | null
          exam_name?: string | null
          exam_schedule?: Json | null
          graduation_check_color?: string | null
          graduation_check_text?: string | null
          header_font_size?: number | null
          header_font_style?: string | null
          headmaster_name?: string
          headmaster_nip?: string | null
          headmaster_position?: string
          headmaster_signature_url?: string | null
          id?: string
          logo_height?: number | null
          logo_position_x?: number | null
          logo_position_y?: number | null
          logo_url?: string | null
          logo_width?: number | null
          right_logo_height?: number | null
          right_logo_position_x?: number | null
          right_logo_position_y?: number | null
          right_logo_url?: string | null
          right_logo_width?: number | null
          school_address?: string | null
          school_id?: string | null
          school_line_spacing?: number | null
          school_name?: string
          school_phone?: string | null
          school_stamp_url?: string | null
          show_address?: boolean | null
          show_phone?: boolean | null
          student_status_check_color?: string | null
          student_status_check_text?: string | null
          subheader_font_size?: number | null
          teacher_upload_access_code?: string | null
          updated_at?: string
          wakasek_sarpras_teacher_id?: string | null
          watermark_enabled?: boolean | null
          watermark_opacity?: number | null
          watermark_position?: string | null
          watermark_size?: number | null
          watermark_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_settings_wakasek_sarpras_teacher_id_fkey"
            columns: ["wakasek_sarpras_teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      school_subscriptions: {
        Row: {
          allowed_features: string[] | null
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          max_students: number | null
          max_teachers: number | null
          monthly_price: number | null
          notes: string | null
          plan_name: string
          school_id: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          allowed_features?: string[] | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          max_students?: number | null
          max_teachers?: number | null
          monthly_price?: number | null
          notes?: string | null
          plan_name?: string
          school_id: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Update: {
          allowed_features?: string[] | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          max_students?: number | null
          max_teachers?: number | null
          monthly_price?: number | null
          notes?: string | null
          plan_name?: string
          school_id?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_subscriptions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          address: string | null
          approval_status: string
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          npsn: string | null
          phone: string | null
          selected_plan_key: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          approval_status?: string
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          npsn?: string | null
          phone?: string | null
          selected_plan_key?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          approval_status?: string
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          npsn?: string | null
          phone?: string | null
          selected_plan_key?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      spd_pdf_settings: {
        Row: {
          created_at: string
          id: string
          school_id: string | null
          settings: Json
          updated_at: string
          updated_by: string
        }
        Insert: {
          created_at?: string
          id?: string
          school_id?: string | null
          settings?: Json
          updated_at?: string
          updated_by: string
        }
        Update: {
          created_at?: string
          id?: string
          school_id?: string | null
          settings?: Json
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "spd_pdf_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      spj_documents: {
        Row: {
          created_at: string
          created_by: string
          file_name: string
          file_url: string
          id: string
          month: number
          parsed_data: Json | null
          school_id: string | null
          status: string | null
          total_realization: number | null
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          created_by: string
          file_name: string
          file_url: string
          id?: string
          month: number
          parsed_data?: Json | null
          school_id?: string | null
          status?: string | null
          total_realization?: number | null
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          created_by?: string
          file_name?: string
          file_url?: string
          id?: string
          month?: number
          parsed_data?: Json | null
          school_id?: string | null
          status?: string | null
          total_realization?: number | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "spj_documents_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      spj_items: {
        Row: {
          activity_name: string
          amount: number | null
          category: string
          created_at: string
          description: string | null
          id: string
          kode_kegiatan: string | null
          kode_rekening: string | null
          main_category: string | null
          school_id: string | null
          spj_id: string
          sub_category: string | null
          transaction_date: string | null
        }
        Insert: {
          activity_name: string
          amount?: number | null
          category: string
          created_at?: string
          description?: string | null
          id?: string
          kode_kegiatan?: string | null
          kode_rekening?: string | null
          main_category?: string | null
          school_id?: string | null
          spj_id: string
          sub_category?: string | null
          transaction_date?: string | null
        }
        Update: {
          activity_name?: string
          amount?: number | null
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          kode_kegiatan?: string | null
          kode_rekening?: string | null
          main_category?: string | null
          school_id?: string | null
          spj_id?: string
          sub_category?: string | null
          transaction_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "spj_items_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spj_items_spj_id_fkey"
            columns: ["spj_id"]
            isOneToOne: false
            referencedRelation: "spj_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      student_accounts: {
        Row: {
          created_at: string
          id: string
          school_id: string | null
          student_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          school_id?: string | null
          student_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          school_id?: string | null
          student_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_accounts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_accounts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_achievements: {
        Row: {
          achievement_date: string
          achievement_name: string
          achievement_type: string
          certificate_url: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          level: string
          school_id: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          achievement_date?: string
          achievement_name: string
          achievement_type?: string
          certificate_url?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          level?: string
          school_id?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          achievement_date?: string
          achievement_name?: string
          achievement_type?: string
          certificate_url?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          level?: string
          school_id?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_achievements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_achievements_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_dispensations: {
        Row: {
          class_id: string | null
          created_at: string
          created_by: string
          dispensation_date: string
          end_time: string | null
          guru_piket_id: string | null
          id: string
          letter_date: string | null
          letter_number: string | null
          notes: string | null
          reason: string
          reason_category: string
          school_id: string | null
          start_time: string | null
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          created_by: string
          dispensation_date?: string
          end_time?: string | null
          guru_piket_id?: string | null
          id?: string
          letter_date?: string | null
          letter_number?: string | null
          notes?: string | null
          reason: string
          reason_category?: string
          school_id?: string | null
          start_time?: string | null
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          created_by?: string
          dispensation_date?: string
          end_time?: string | null
          guru_piket_id?: string | null
          id?: string
          letter_date?: string | null
          letter_number?: string | null
          notes?: string | null
          reason?: string
          reason_category?: string
          school_id?: string | null
          start_time?: string | null
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_dispensations_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_dispensations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_dispensations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_mutations: {
        Row: {
          created_at: string
          created_by: string | null
          destination_school: string
          id: string
          mutation_date: string
          notes: string | null
          reason: string | null
          school_id: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          destination_school: string
          id?: string
          mutation_date?: string
          notes?: string | null
          reason?: string | null
          school_id?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          destination_school?: string
          id?: string
          mutation_date?: string
          notes?: string | null
          reason?: string | null
          school_id?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_mutations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_mutations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_violations: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          points: number
          reported_by: string | null
          school_id: string | null
          student_id: string
          updated_at: string
          violation_date: string
          violation_type_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          points?: number
          reported_by?: string | null
          school_id?: string | null
          student_id: string
          updated_at?: string
          violation_date?: string
          violation_type_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          points?: number
          reported_by?: string | null
          school_id?: string | null
          student_id?: string
          updated_at?: string
          violation_date?: string
          violation_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_violations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_violations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_violations_violation_type_id_fkey"
            columns: ["violation_type_id"]
            isOneToOne: false
            referencedRelation: "violation_types"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          address: string | null
          birth_date: string | null
          birth_place: string | null
          class_id: string | null
          created_at: string | null
          full_name: string
          gender: string | null
          graduation_date: string | null
          id: string
          is_alumni: boolean | null
          nis: string
          nisn: string | null
          parent_name: string | null
          parent_phone: string | null
          photo_url: string | null
          rfid_uid: string | null
          school_id: string | null
          status: string
          telegram_chat_id: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          birth_place?: string | null
          class_id?: string | null
          created_at?: string | null
          full_name: string
          gender?: string | null
          graduation_date?: string | null
          id?: string
          is_alumni?: boolean | null
          nis: string
          nisn?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          photo_url?: string | null
          rfid_uid?: string | null
          school_id?: string | null
          status?: string
          telegram_chat_id?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          birth_place?: string | null
          class_id?: string | null
          created_at?: string | null
          full_name?: string
          gender?: string | null
          graduation_date?: string | null
          id?: string
          is_alumni?: boolean | null
          nis?: string
          nisn?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          photo_url?: string | null
          rfid_uid?: string | null
          school_id?: string | null
          status?: string
          telegram_chat_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          created_at: string
          description: string
          duration_months: number
          features: string[]
          id: string
          is_active: boolean
          label: string
          max_students: number
          max_teachers: number
          monthly_price: number
          plan_key: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          duration_months?: number
          features?: string[]
          id?: string
          is_active?: boolean
          label: string
          max_students?: number
          max_teachers?: number
          monthly_price?: number
          plan_key: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          duration_months?: number
          features?: string[]
          id?: string
          is_active?: boolean
          label?: string
          max_students?: number
          max_teachers?: number
          monthly_price?: number
          plan_key?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      surat_keluar: {
        Row: {
          catatan: string | null
          created_at: string
          created_by: string
          file_url: string | null
          id: string
          kategori: string
          nomor_surat: string
          perihal: string
          school_id: string | null
          tanggal_surat: string
          tujuan: string
          updated_at: string
        }
        Insert: {
          catatan?: string | null
          created_at?: string
          created_by: string
          file_url?: string | null
          id?: string
          kategori?: string
          nomor_surat: string
          perihal: string
          school_id?: string | null
          tanggal_surat?: string
          tujuan: string
          updated_at?: string
        }
        Update: {
          catatan?: string | null
          created_at?: string
          created_by?: string
          file_url?: string | null
          id?: string
          kategori?: string
          nomor_surat?: string
          perihal?: string
          school_id?: string | null
          tanggal_surat?: string
          tujuan?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "surat_keluar_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      surat_masuk: {
        Row: {
          catatan: string | null
          created_at: string
          created_by: string
          file_url: string | null
          id: string
          kategori: string
          nomor_surat: string
          pengirim: string
          perihal: string
          school_id: string | null
          tanggal_diterima: string
          tanggal_surat: string
          updated_at: string
        }
        Insert: {
          catatan?: string | null
          created_at?: string
          created_by: string
          file_url?: string | null
          id?: string
          kategori?: string
          nomor_surat: string
          pengirim: string
          perihal: string
          school_id?: string | null
          tanggal_diterima?: string
          tanggal_surat: string
          updated_at?: string
        }
        Update: {
          catatan?: string | null
          created_at?: string
          created_by?: string
          file_url?: string | null
          id?: string
          kategori?: string
          nomor_surat?: string
          pengirim?: string
          perihal?: string
          school_id?: string | null
          tanggal_diterima?: string
          tanggal_surat?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "surat_masuk_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_configurations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          local_supabase_url: string | null
          name: string
          school_id: string | null
          sync_direction: string
          sync_interval_minutes: number | null
          tables_to_sync: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          local_supabase_url?: string | null
          name?: string
          school_id?: string | null
          sync_direction?: string
          sync_interval_minutes?: number | null
          tables_to_sync?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          local_supabase_url?: string | null
          name?: string
          school_id?: string | null
          sync_direction?: string
          sync_interval_minutes?: number | null
          tables_to_sync?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_configurations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_logs: {
        Row: {
          created_at: string
          created_by: string
          error_message: string | null
          id: string
          records_count: number
          school_id: string | null
          status: string
          sync_type: string
          table_name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          error_message?: string | null
          id?: string
          records_count?: number
          school_id?: string | null
          status: string
          sync_type: string
          table_name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          error_message?: string | null
          id?: string
          records_count?: number
          school_id?: string | null
          status?: string
          sync_type?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_records: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          gross_amount: number
          id: string
          npwp: string | null
          receipt_number: string | null
          record_date: string
          school_id: string | null
          tax_amount: number
          tax_type_id: string
          taxpayer_name: string | null
          transaction_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          gross_amount?: number
          id?: string
          npwp?: string | null
          receipt_number?: string | null
          record_date?: string
          school_id?: string | null
          tax_amount?: number
          tax_type_id: string
          taxpayer_name?: string | null
          transaction_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          gross_amount?: number
          id?: string
          npwp?: string | null
          receipt_number?: string | null
          record_date?: string
          school_id?: string | null
          tax_amount?: number
          tax_type_id?: string
          taxpayer_name?: string | null
          transaction_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_records_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_records_tax_type_id_fkey"
            columns: ["tax_type_id"]
            isOneToOne: false
            referencedRelation: "tax_types"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_types: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          rate: number
          school_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          rate?: number
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          rate?: number
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_types_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_file_submissions: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          notes: string | null
          requirement_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          school_id: string | null
          status: string | null
          teacher_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          notes?: string | null
          requirement_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string | null
          status?: string | null
          teacher_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          notes?: string | null
          requirement_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string | null
          status?: string | null
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_file_submissions_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "file_upload_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_file_submissions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_file_submissions_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          created_at: string | null
          id: string
          is_homeroom_teacher: boolean | null
          jabatan: string | null
          nip: string | null
          nuptk: string | null
          pangkat_golongan: string | null
          photo_url: string | null
          school_id: string | null
          subject: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_homeroom_teacher?: boolean | null
          jabatan?: string | null
          nip?: string | null
          nuptk?: string | null
          pangkat_golongan?: string | null
          photo_url?: string | null
          school_id?: string | null
          subject: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_homeroom_teacher?: boolean | null
          jabatan?: string | null
          nip?: string | null
          nuptk?: string | null
          pangkat_golongan?: string | null
          photo_url?: string | null
          school_id?: string | null
          subject?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teachers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teachers_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teachers_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      teaching_journals: {
        Row: {
          activity: string | null
          created_at: string | null
          created_by: string
          date: string
          id: string
          material: string
          notes: string | null
          schedule_id: string | null
          school_id: string | null
          students_absent: number | null
          students_present: number | null
          updated_at: string | null
          sched_academic_year: string | null
          sched_class_id: string | null
          sched_day_of_week: number | null
          sched_end_time: string | null
          sched_semester: number | null
          sched_start_time: string | null
          sched_subject: string | null
          sched_teacher_id: string | null
        }
        Insert: {
          activity?: string | null
          created_at?: string | null
          created_by: string
          date: string
          id?: string
          material: string
          notes?: string | null
          schedule_id: string
          school_id?: string | null
          students_absent?: number | null
          students_present?: number | null
          updated_at?: string | null
          sched_academic_year?: string | null
          sched_class_id?: string | null
          sched_day_of_week?: number | null
          sched_end_time?: string | null
          sched_semester?: number | null
          sched_start_time?: string | null
          sched_subject?: string | null
          sched_teacher_id?: string | null
        }
        Update: {
          activity?: string | null
          created_at?: string | null
          created_by?: string
          date?: string
          id?: string
          material?: string
          notes?: string | null
          schedule_id?: string
          school_id?: string | null
          students_absent?: number | null
          students_present?: number | null
          updated_at?: string | null
          sched_academic_year?: string | null
          sched_class_id?: string | null
          sched_day_of_week?: number | null
          sched_end_time?: string | null
          sched_semester?: number | null
          sched_start_time?: string | null
          sched_subject?: string | null
          sched_teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teaching_journals_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_journals_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_settings: {
        Row: {
          bot_token: string | null
          bot_username: string | null
          created_at: string
          enabled: boolean
          id: string
          message_template: string
          notify_check_in: boolean
          notify_check_out: boolean
          school_id: string | null
          updated_at: string
        }
        Insert: {
          bot_token?: string | null
          bot_username?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          message_template?: string
          notify_check_in?: boolean
          notify_check_out?: boolean
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          bot_token?: string | null
          bot_username?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          message_template?: string
          notify_check_in?: boolean
          notify_check_out?: boolean
          school_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      travel_payment_rates: {
        Row: {
          accommodation_rate: number
          created_at: string
          daily_rate: number
          id: string
          position_type: string
          school_id: string | null
          transport_rate: number
          updated_at: string
        }
        Insert: {
          accommodation_rate?: number
          created_at?: string
          daily_rate?: number
          id?: string
          position_type: string
          school_id?: string | null
          transport_rate?: number
          updated_at?: string
        }
        Update: {
          accommodation_rate?: number
          created_at?: string
          daily_rate?: number
          id?: string
          position_type?: string
          school_id?: string | null
          transport_rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_payment_rates_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          school_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      verified_reports: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          report_data: Json
          report_type: string
          school_id: string | null
          serial_number: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          report_data: Json
          report_type: string
          school_id?: string | null
          serial_number: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          report_data?: Json
          report_type?: string
          school_id?: string | null
          serial_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "verified_reports_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      violation_types: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          points: number
          school_id: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          points?: number
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          points?: number
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "violation_types_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      website_agenda: {
        Row: {
          created_at: string
          description: string | null
          end_at: string | null
          id: string
          is_published: boolean
          location: string | null
          school_id: string | null
          start_at: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_at?: string | null
          id?: string
          is_published?: boolean
          location?: string | null
          school_id?: string | null
          start_at: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_at?: string | null
          id?: string
          is_published?: boolean
          location?: string | null
          school_id?: string | null
          start_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      website_contact_messages: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_read: boolean
          message: string
          name: string
          phone: string | null
          school_id: string | null
          subject: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_read?: boolean
          message: string
          name: string
          phone?: string | null
          school_id?: string | null
          subject?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_read?: boolean
          message?: string
          name?: string
          phone?: string | null
          school_id?: string | null
          subject?: string | null
        }
        Relationships: []
      }
      website_gallery_albums: {
        Row: {
          cover_image_url: string | null
          created_at: string
          description: string | null
          event_date: string | null
          id: string
          is_published: boolean
          school_id: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          event_date?: string | null
          id?: string
          is_published?: boolean
          school_id?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          event_date?: string | null
          id?: string
          is_published?: boolean
          school_id?: string | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      website_gallery_items: {
        Row: {
          album_id: string | null
          caption: string | null
          created_at: string
          id: string
          media_type: string
          media_url: string
          school_id: string | null
          sort_order: number
        }
        Insert: {
          album_id?: string | null
          caption?: string | null
          created_at?: string
          id?: string
          media_type?: string
          media_url: string
          school_id?: string | null
          sort_order?: number
        }
        Update: {
          album_id?: string | null
          caption?: string | null
          created_at?: string
          id?: string
          media_type?: string
          media_url?: string
          school_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "website_gallery_items_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "website_gallery_albums"
            referencedColumns: ["id"]
          },
        ]
      }
      website_hero_slides: {
        Row: {
          created_at: string
          cta_label: string | null
          cta_url: string | null
          id: string
          image_url: string
          is_active: boolean
          school_id: string | null
          sort_order: number
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          id?: string
          image_url: string
          is_active?: boolean
          school_id?: string | null
          sort_order?: number
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          id?: string
          image_url?: string
          is_active?: boolean
          school_id?: string | null
          sort_order?: number
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      wa_bot_settings: {
        Row: {
          daily_recap_enabled: boolean
          daily_recap_time: string
          followup_attendance: boolean
          followup_journal: boolean
          reminder_scope: string
          id: number
          reminder_followup_min: number
          reminder_lead_min: number
          teacher_reminder_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          daily_recap_enabled?: boolean
          daily_recap_time?: string
          followup_attendance?: boolean
          followup_journal?: boolean
          reminder_scope?: string
          id?: number
          reminder_followup_min?: number
          reminder_lead_min?: number
          teacher_reminder_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          daily_recap_enabled?: boolean
          daily_recap_time?: string
          followup_attendance?: boolean
          followup_journal?: boolean
          reminder_scope?: string
          id?: number
          reminder_followup_min?: number
          reminder_lead_min?: number
          teacher_reminder_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      wa_message_templates: {
        Row: {
          body: string
          is_enabled: boolean
          key: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          is_enabled?: boolean
          key: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          is_enabled?: boolean
          key?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      website_news: {
        Row: {
          author_id: string | null
          author_name: string | null
          category_id: string | null
          content: string | null
          cover_image_url: string | null
          created_at: string
          excerpt: string | null
          id: string
          is_featured: boolean
          published_at: string | null
          school_id: string | null
          slug: string
          status: string
          title: string
          updated_at: string
          view_count: number
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          category_id?: string | null
          content?: string | null
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          is_featured?: boolean
          published_at?: string | null
          school_id?: string | null
          slug: string
          status?: string
          title: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          category_id?: string | null
          content?: string | null
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          is_featured?: boolean
          published_at?: string | null
          school_id?: string | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "website_news_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "website_news_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      website_news_categories: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          school_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          school_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          school_id?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      website_pages: {
        Row: {
          content: string | null
          cover_image_url: string | null
          created_at: string
          id: string
          is_published: boolean
          school_id: string | null
          section: string | null
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          cover_image_url?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          school_id?: string | null
          section?: string | null
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          cover_image_url?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          school_id?: string | null
          section?: string | null
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      website_programs: {
        Row: {
          cover_image_url: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_published: boolean
          name: string
          school_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_published?: boolean
          name: string
          school_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_published?: boolean
          name?: string
          school_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      website_settings: {
        Row: {
          about_short: string | null
          address: string | null
          chatbot_enabled: boolean
          chatbot_name: string | null
          chatbot_welcome: string | null
          created_at: string
          email: string | null
          facebook_url: string | null
          favicon_url: string | null
          id: string
          instagram_access_token: string | null
          instagram_auto_fetch: boolean
          instagram_cache: Json | null
          instagram_cache_at: string | null
          instagram_post_urls: string | null
          instagram_section_enabled: boolean | null
          instagram_section_title: string | null
          instagram_url: string | null
          instagram_user_id: string | null
          instagram_username: string | null
          logo_url: string | null
          map_embed_url: string | null
          meta_description: string | null
          meta_keywords: string | null
          meta_title: string | null
          phone: string | null
          primary_color: string | null
          school_id: string | null
          show_lapor_button: boolean
          site_name: string
          tagline: string | null
          tiktok_url: string | null
          updated_at: string
          whatsapp: string | null
          youtube_url: string | null
        }
        Insert: {
          about_short?: string | null
          address?: string | null
          chatbot_enabled?: boolean
          chatbot_name?: string | null
          chatbot_welcome?: string | null
          created_at?: string
          email?: string | null
          facebook_url?: string | null
          favicon_url?: string | null
          id?: string
          instagram_access_token?: string | null
          instagram_auto_fetch?: boolean
          instagram_cache?: Json | null
          instagram_cache_at?: string | null
          instagram_post_urls?: string | null
          instagram_section_enabled?: boolean | null
          instagram_section_title?: string | null
          instagram_url?: string | null
          instagram_user_id?: string | null
          instagram_username?: string | null
          logo_url?: string | null
          map_embed_url?: string | null
          meta_description?: string | null
          meta_keywords?: string | null
          meta_title?: string | null
          phone?: string | null
          primary_color?: string | null
          school_id?: string | null
          show_lapor_button?: boolean
          site_name?: string
          tagline?: string | null
          tiktok_url?: string | null
          updated_at?: string
          whatsapp?: string | null
          youtube_url?: string | null
        }
        Update: {
          about_short?: string | null
          address?: string | null
          chatbot_enabled?: boolean
          chatbot_name?: string | null
          chatbot_welcome?: string | null
          created_at?: string
          email?: string | null
          facebook_url?: string | null
          favicon_url?: string | null
          id?: string
          instagram_access_token?: string | null
          instagram_auto_fetch?: boolean
          instagram_cache?: Json | null
          instagram_cache_at?: string | null
          instagram_post_urls?: string | null
          instagram_section_enabled?: boolean | null
          instagram_section_title?: string | null
          instagram_url?: string | null
          instagram_user_id?: string | null
          instagram_username?: string | null
          logo_url?: string | null
          map_embed_url?: string | null
          meta_description?: string | null
          meta_keywords?: string | null
          meta_title?: string | null
          phone?: string | null
          primary_color?: string | null
          school_id?: string | null
          show_lapor_button?: boolean
          site_name?: string
          tagline?: string | null
          tiktok_url?: string | null
          updated_at?: string
          whatsapp?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      worker_payment_batches: {
        Row: {
          batch_number: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          job_title: string
          receipt_date: string
          school_id: string | null
          tax_rate: number
          total_gross: number
          total_net: number
          total_tax: number
          updated_at: string
        }
        Insert: {
          batch_number: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          job_title: string
          receipt_date?: string
          school_id?: string | null
          tax_rate?: number
          total_gross?: number
          total_net?: number
          total_tax?: number
          updated_at?: string
        }
        Update: {
          batch_number?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          job_title?: string
          receipt_date?: string
          school_id?: string | null
          tax_rate?: number
          total_gross?: number
          total_net?: number
          total_tax?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_payment_batches_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_payments: {
        Row: {
          batch_id: string
          created_at: string
          daily_rate: number
          end_date: string
          gross_amount: number
          id: string
          net_amount: number
          position_type: string
          school_id: string | null
          start_date: string
          tax_amount: number
          work_days: number
          worker_name: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          daily_rate?: number
          end_date: string
          gross_amount?: number
          id?: string
          net_amount?: number
          position_type: string
          school_id?: string | null
          start_date: string
          tax_amount?: number
          work_days?: number
          worker_name: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          daily_rate?: number
          end_date?: string
          gross_amount?: number
          id?: string
          net_amount?: number
          position_type?: string
          school_id?: string | null
          start_date?: string
          tax_amount?: number
          work_days?: number
          worker_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_payments_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "worker_payment_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_payments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_rates: {
        Row: {
          created_at: string
          daily_rate: number
          id: string
          position_type: string
          school_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_rate?: number
          id?: string
          position_type: string
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_rate?: number
          id?: string
          position_type?: string
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_rates_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      zapier_webhooks: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          school_id: string | null
          table_name: string
          updated_at: string
          webhook_url: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          school_id?: string | null
          table_name: string
          updated_at?: string
          webhook_url: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          school_id?: string | null
          table_name?: string
          updated_at?: string
          webhook_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "zapier_webhooks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      account_lock_status: {
        Row: {
          is_locked: boolean | null
          lock_message: string | null
        }
        Relationships: []
      }
      active_login_notifications: {
        Row: {
          end_date: string | null
          id: string | null
          message: string | null
          notification_type: string | null
          start_date: string | null
          title: string | null
        }
        Insert: {
          end_date?: string | null
          id?: string | null
          message?: string | null
          notification_type?: string | null
          start_date?: string | null
          title?: string | null
        }
        Update: {
          end_date?: string | null
          id?: string | null
          message?: string | null
          notification_type?: string | null
          start_date?: string | null
          title?: string | null
        }
        Relationships: []
      }
      profiles_public: {
        Row: {
          full_name: string | null
          id: string | null
        }
        Insert: {
          full_name?: string | null
          id?: string | null
        }
        Update: {
          full_name?: string | null
          id?: string | null
        }
        Relationships: []
      }
      school_settings_public: {
        Row: {
          academic_year: string | null
          active_semester: number | null
          activity_permission_color: string | null
          activity_permission_text: string | null
          app_name: string | null
          complaint_channel_color: string | null
          complaint_channel_text: string | null
          complaint_status_check_color: string | null
          complaint_status_check_text: string | null
          district_name: string | null
          enable_activity_permission: boolean | null
          enable_captcha: boolean | null
          enable_complaint_channel: boolean | null
          enable_complaint_status_check: boolean | null
          enable_graduation_check: boolean | null
          enable_student_status_check: boolean | null
          graduation_check_color: string | null
          graduation_check_text: string | null
          id: string | null
          logo_url: string | null
          right_logo_url: string | null
          school_name: string | null
          show_address: boolean | null
          show_phone: boolean | null
          student_status_check_color: string | null
          student_status_check_text: string | null
        }
        Insert: {
          academic_year?: string | null
          active_semester?: number | null
          activity_permission_color?: string | null
          activity_permission_text?: string | null
          app_name?: string | null
          complaint_channel_color?: string | null
          complaint_channel_text?: string | null
          complaint_status_check_color?: string | null
          complaint_status_check_text?: string | null
          district_name?: string | null
          enable_activity_permission?: boolean | null
          enable_captcha?: boolean | null
          enable_complaint_channel?: boolean | null
          enable_complaint_status_check?: boolean | null
          enable_graduation_check?: boolean | null
          enable_student_status_check?: boolean | null
          graduation_check_color?: string | null
          graduation_check_text?: string | null
          id?: string | null
          logo_url?: string | null
          right_logo_url?: string | null
          school_name?: string | null
          show_address?: boolean | null
          show_phone?: boolean | null
          student_status_check_color?: string | null
          student_status_check_text?: string | null
        }
        Update: {
          academic_year?: string | null
          active_semester?: number | null
          activity_permission_color?: string | null
          activity_permission_text?: string | null
          app_name?: string | null
          complaint_channel_color?: string | null
          complaint_channel_text?: string | null
          complaint_status_check_color?: string | null
          complaint_status_check_text?: string | null
          district_name?: string | null
          enable_activity_permission?: boolean | null
          enable_captcha?: boolean | null
          enable_complaint_channel?: boolean | null
          enable_complaint_status_check?: boolean | null
          enable_graduation_check?: boolean | null
          enable_student_status_check?: boolean | null
          graduation_check_color?: string | null
          graduation_check_text?: string | null
          id?: string | null
          logo_url?: string | null
          right_logo_url?: string | null
          school_name?: string | null
          show_address?: boolean | null
          show_phone?: boolean | null
          student_status_check_color?: string | null
          student_status_check_text?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      exec_sql_readonly: { Args: { sql_query: string }; Returns: Json }
      generate_complaint_tracking_number: { Args: never; Returns: string }
      generate_report_serial: { Args: never; Returns: string }
      get_app_name: { Args: never; Returns: string }
      get_attendance_by_class: {
        Args: {
          p_academic_year: string
          p_end_date: string
          p_start_date: string
        }
        Returns: {
          alpa: number
          belum: number
          class_id: string
          expected: number
          hadir: number
          izin: number
          sakit: number
        }[]
      }
      get_attendance_recap: {
        Args: {
          p_academic_year: string
          p_end_date: string
          p_start_date: string
        }
        Returns: {
          alpa: number
          belum: number
          expected: number
          hadir: number
          izin: number
          sakit: number
          total: number
        }[]
      }
      get_connection_stats: {
        Args: never
        Returns: {
          active_connections: number
          max_connections: number
        }[]
      }
      get_database_size: {
        Args: never
        Returns: {
          db_size: number
          db_size_pretty: string
        }[]
      }
      get_my_telegram_chat_id: { Args: never; Returns: string }
      get_punctuality_stats: {
        Args: { p_class_id?: string; p_end_date: string; p_start_date: string }
        Returns: {
          date: string
          tepat_waktu: number
          terlambat: number
        }[]
      }
      get_school_settings_for_letterhead: { Args: never; Returns: Json }
      get_storage_stats: {
        Args: never
        Returns: {
          bucket_count: number
          total_files: number
          total_size: number
          total_size_pretty: string
        }[]
      }
      get_table_stats: {
        Args: never
        Returns: {
          row_count: number
          table_name: string
          table_size: string
        }[]
      }
      get_telegram_bot_info: { Args: never; Returns: Json }
      get_user_school_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_letter_staff: { Args: never; Returns: boolean }
      is_my_teacher_row: { Args: { _teacher_id: string }; Returns: boolean }
      is_school_subscription_active: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      rfid_process_tap:
        | { Args: { p_uid: string }; Returns: Json }
        | { Args: { p_face_verified?: boolean; p_uid: string }; Returns: Json }
      rfid_uid_variants: { Args: { _uid: string }; Returns: string[] }
      set_my_telegram_chat_id: { Args: { _chat_id: string }; Returns: boolean }
      teacher_upload_access_required: { Args: never; Returns: boolean }
      to_title_case: { Args: { name: string }; Returns: string }
      verify_teacher_upload_access_code: {
        Args: { _code: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "teacher"
        | "tata_usaha"
        | "bendahara"
        | "siswa"
        | "kesiswaan"
        | "polling"
        | "billing"
        | "super_admin"
        | "guru_piket"
        | "admin_web"
        | "pembina_ekskul"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "teacher",
        "tata_usaha",
        "bendahara",
        "siswa",
        "kesiswaan",
        "polling",
        "billing",
        "super_admin",
        "guru_piket",
        "admin_web",
        "pembina_ekskul",
      ],
    },
  },
} as const