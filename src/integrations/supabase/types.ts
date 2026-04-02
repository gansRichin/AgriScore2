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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      application_animals: {
        Row: {
          application_id: string | null
          bull_number: string | null
          id: string
          inj: string
        }
        Insert: {
          application_id?: string | null
          bull_number?: string | null
          id?: string
          inj: string
        }
        Update: {
          application_id?: string | null
          bull_number?: string | null
          id?: string
          inj?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_animals_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          address_akimat: string | null
          address_district: string | null
          address_region: string | null
          application_number: string | null
          created_at: string | null
          farm_type: string | null
          has_iszh: boolean | null
          has_land: boolean | null
          has_no_debt: boolean | null
          has_prev_subsidy: boolean | null
          head_count: number | null
          id: string
          iin_bin: string | null
          met_obligations: boolean | null
          normative: number | null
          prev_subsidy_used: boolean | null
          producer_name: string | null
          status: string | null
          submitted_at: string | null
          subsidy_direction: string | null
          subsidy_name: string | null
          total_amount: number | null
          user_id: string | null
        }
        Insert: {
          address_akimat?: string | null
          address_district?: string | null
          address_region?: string | null
          application_number?: string | null
          created_at?: string | null
          farm_type?: string | null
          has_iszh?: boolean | null
          has_land?: boolean | null
          has_no_debt?: boolean | null
          has_prev_subsidy?: boolean | null
          head_count?: number | null
          id?: string
          iin_bin?: string | null
          met_obligations?: boolean | null
          normative?: number | null
          prev_subsidy_used?: boolean | null
          producer_name?: string | null
          status?: string | null
          submitted_at?: string | null
          subsidy_direction?: string | null
          subsidy_name?: string | null
          total_amount?: number | null
          user_id?: string | null
        }
        Update: {
          address_akimat?: string | null
          address_district?: string | null
          address_region?: string | null
          application_number?: string | null
          created_at?: string | null
          farm_type?: string | null
          has_iszh?: boolean | null
          has_land?: boolean | null
          has_no_debt?: boolean | null
          has_prev_subsidy?: boolean | null
          head_count?: number | null
          id?: string
          iin_bin?: string | null
          met_obligations?: boolean | null
          normative?: number | null
          prev_subsidy_used?: boolean | null
          producer_name?: string | null
          status?: string | null
          submitted_at?: string | null
          subsidy_direction?: string | null
          subsidy_name?: string | null
          total_amount?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expert_reviews: {
        Row: {
          application_id: string | null
          comment: string | null
          created_at: string | null
          decision: string | null
          expert_id: string | null
          id: string
        }
        Insert: {
          application_id?: string | null
          comment?: string | null
          created_at?: string | null
          decision?: string | null
          expert_id?: string | null
          id?: string
        }
        Update: {
          application_id?: string | null
          comment?: string | null
          created_at?: string | null
          decision?: string | null
          expert_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expert_reviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expert_reviews_expert_id_fkey"
            columns: ["expert_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          full_name: string | null
          id: string
          iin_bin: string | null
          phone: string | null
          role: string | null
        }
        Insert: {
          created_at?: string | null
          full_name?: string | null
          id: string
          iin_bin?: string | null
          phone?: string | null
          role?: string | null
        }
        Update: {
          created_at?: string | null
          full_name?: string | null
          id?: string
          iin_bin?: string | null
          phone?: string | null
          role?: string | null
        }
        Relationships: []
      }
      subsidy_history: {
        Row: {
          application_id: string | null
          id: string
          inj: string
          paid_amount: number | null
          status: string | null
          year: number
        }
        Insert: {
          application_id?: string | null
          id?: string
          inj: string
          paid_amount?: number | null
          status?: string | null
          year: number
        }
        Update: {
          application_id?: string | null
          id?: string
          inj?: string
          paid_amount?: number | null
          status?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "subsidy_history_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: { Args: { user_id: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
