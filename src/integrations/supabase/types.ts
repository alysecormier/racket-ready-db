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
      accounts: {
        Row: {
          account_status: string
          created_at: string
          deposit_status: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
        }
        Insert: {
          account_status?: string
          created_at?: string
          deposit_status?: string
          email?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          phone?: string | null
        }
        Update: {
          account_status?: string
          created_at?: string
          deposit_status?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      bookings: {
        Row: {
          canceled_at: string | null
          cancellation_status: string
          created_at: string
          id: string
          lesson_id: string
          payment_status: string
          profile_id: string
          reminder_sent_at: string | null
          signed_at: string | null
          signed_waiver: boolean
          stay_for_match_play: boolean
          stripe_payment_intent_id: string | null
          stripe_payment_method_id: string | null
          student_id: string | null
        }
        Insert: {
          canceled_at?: string | null
          cancellation_status?: string
          created_at?: string
          id?: string
          lesson_id: string
          payment_status?: string
          profile_id: string
          reminder_sent_at?: string | null
          signed_at?: string | null
          signed_waiver?: boolean
          stay_for_match_play?: boolean
          stripe_payment_intent_id?: string | null
          stripe_payment_method_id?: string | null
          student_id?: string | null
        }
        Update: {
          canceled_at?: string | null
          cancellation_status?: string
          created_at?: string
          id?: string
          lesson_id?: string
          payment_status?: string
          profile_id?: string
          reminder_sent_at?: string | null
          signed_at?: string | null
          signed_waiver?: boolean
          stay_for_match_play?: boolean
          stripe_payment_intent_id?: string | null
          stripe_payment_method_id?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_notes: {
        Row: {
          client_id: string
          coach_id: string
          created_at: string
          id: string
          note: string
        }
        Insert: {
          client_id: string
          coach_id: string
          created_at?: string
          id?: string
          note: string
        }
        Update: {
          client_id?: string
          coach_id?: string
          created_at?: string
          id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_notes_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          account_id: string
          email_type: string
          id: string
          lesson_booking_id: string | null
          participant_id: string | null
          sent_at: string
          sent_to: string
          status: string
          subject: string
        }
        Insert: {
          account_id: string
          email_type: string
          id?: string
          lesson_booking_id?: string | null
          participant_id?: string | null
          sent_at?: string
          sent_to: string
          status?: string
          subject: string
        }
        Update: {
          account_id?: string
          email_type?: string
          id?: string
          lesson_booking_id?: string | null
          participant_id?: string | null
          sent_at?: string
          sent_to?: string
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_lesson_booking_id_fkey"
            columns: ["lesson_booking_id"]
            isOneToOne: false
            referencedRelation: "lesson_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_bookings: {
        Row: {
          account_id: string
          cancellation_requested_at: string | null
          cancellation_status: string
          created_at: string
          deposit_amount: number
          deposit_status: string
          id: string
          is_waitlisted: boolean
          lesson_date: string
          lesson_end_time: string | null
          lesson_id: string
          lesson_name: string
          lesson_price: number
          lesson_start_time: string | null
          participant_id: string
          payment_method: string | null
          payment_reported_at: string | null
          policy_acknowledged: boolean
          policy_acknowledged_at: string | null
        }
        Insert: {
          account_id: string
          cancellation_requested_at?: string | null
          cancellation_status?: string
          created_at?: string
          deposit_amount?: number
          deposit_status?: string
          id?: string
          is_waitlisted?: boolean
          lesson_date: string
          lesson_end_time?: string | null
          lesson_id: string
          lesson_name: string
          lesson_price?: number
          lesson_start_time?: string | null
          participant_id: string
          payment_method?: string | null
          payment_reported_at?: string | null
          policy_acknowledged?: boolean
          policy_acknowledged_at?: string | null
        }
        Update: {
          account_id?: string
          cancellation_requested_at?: string | null
          cancellation_status?: string
          created_at?: string
          deposit_amount?: number
          deposit_status?: string
          id?: string
          is_waitlisted?: boolean
          lesson_date?: string
          lesson_end_time?: string | null
          lesson_id?: string
          lesson_name?: string
          lesson_price?: number
          lesson_start_time?: string | null
          participant_id?: string
          payment_method?: string | null
          payment_reported_at?: string | null
          policy_acknowledged?: boolean
          policy_acknowledged_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_bookings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_bookings_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          capacity: number
          created_at: string
          end_time: string
          id: string
          lesson_type: string | null
          price: number
          start_time: string
          title: string
          updated_at: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          end_time: string
          id?: string
          lesson_type?: string | null
          price?: number
          start_time: string
          title: string
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          end_time?: string
          id?: string
          lesson_type?: string | null
          price?: number
          start_time?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      participants: {
        Row: {
          account_id: string
          age: number | null
          created_at: string
          first_name: string
          gender: string | null
          id: string
          is_account_holder: boolean
          is_saved: boolean
          last_name: string
          participant_type: string
        }
        Insert: {
          account_id: string
          age?: number | null
          created_at?: string
          first_name: string
          gender?: string | null
          id?: string
          is_account_holder?: boolean
          is_saved?: boolean
          last_name: string
          participant_type: string
        }
        Update: {
          account_id?: string
          age?: number | null
          created_at?: string
          first_name?: string
          gender?: string | null
          id?: string
          is_account_holder?: boolean
          is_saved?: boolean
          last_name?: string
          participant_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "participants_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          default_payment_method_id: string | null
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          saved_card_last4: string | null
          stripe_customer_id: string | null
          updated_at: string
          waiver_signature: string | null
          waiver_signed: boolean
          waiver_signed_at: string | null
        }
        Insert: {
          created_at?: string
          default_payment_method_id?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          saved_card_last4?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
          waiver_signature?: string | null
          waiver_signed?: boolean
          waiver_signed_at?: string | null
        }
        Update: {
          created_at?: string
          default_payment_method_id?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          saved_card_last4?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
          waiver_signature?: string | null
          waiver_signed?: boolean
          waiver_signed_at?: string | null
        }
        Relationships: []
      }
      students: {
        Row: {
          age: number | null
          created_at: string
          gender: string | null
          id: string
          name: string
          parent_id: string
        }
        Insert: {
          age?: number | null
          created_at?: string
          gender?: string | null
          id?: string
          name: string
          parent_id: string
        }
        Update: {
          age?: number | null
          created_at?: string
          gender?: string | null
          id?: string
          name?: string
          parent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          id: string
          joined_at: string
          lesson_id: string
          offer_accepted: boolean | null
          offer_declined: boolean | null
          offer_expires_at: string | null
          offered_at: string | null
          profile_id: string
          student_id: string | null
        }
        Insert: {
          id?: string
          joined_at?: string
          lesson_id: string
          offer_accepted?: boolean | null
          offer_declined?: boolean | null
          offer_expires_at?: string | null
          offered_at?: string | null
          profile_id: string
          student_id?: string | null
        }
        Update: {
          id?: string
          joined_at?: string
          lesson_id?: string
          offer_accepted?: boolean | null
          offer_declined?: boolean | null
          offer_expires_at?: string | null
          offered_at?: string | null
          profile_id?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "coach" | "client"
      user_role: "coach" | "client"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "coach", "client"],
      user_role: ["coach", "client"],
    },
  },
} as const
