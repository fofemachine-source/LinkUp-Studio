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
      appointments: {
        Row: {
          client_id: string | null
          client_name: string | null
          client_whatsapp: string | null
          created_at: string
          end_at: string
          id: string
          is_vip: boolean | null
          notes: string | null
          professional_id: string
          service_id: string | null
          source: string | null
          start_at: string
          status: string | null
          tenant_id: string
        }
        Insert: {
          client_id?: string | null
          client_name?: string | null
          client_whatsapp?: string | null
          created_at?: string
          end_at: string
          id?: string
          is_vip?: boolean | null
          notes?: string | null
          professional_id: string
          service_id?: string | null
          source?: string | null
          start_at: string
          status?: string | null
          tenant_id: string
        }
        Update: {
          client_id?: string | null
          client_name?: string | null
          client_whatsapp?: string | null
          created_at?: string
          end_at?: string
          id?: string
          is_vip?: boolean | null
          notes?: string | null
          professional_id?: string
          service_id?: string | null
          source?: string | null
          start_at?: string
          status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_movements: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          description: string | null
          id: string
          kind: string
          tenant_id: string
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind: string
          tenant_id: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_subscriber: boolean | null
          notes: string | null
          tenant_id: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_subscriber?: boolean | null
          notes?: string | null
          tenant_id: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_subscriber?: boolean | null
          notes?: string | null
          tenant_id?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      commanda_items: {
        Row: {
          commanda_id: string
          commission_pct: number | null
          commission_status: string | null
          commission_value: number | null
          created_at: string
          id: string
          kind: string
          name: string
          professional_id: string | null
          quantity: number | null
          ref_id: string | null
          tenant_id: string
          unit_price: number
        }
        Insert: {
          commanda_id: string
          commission_pct?: number | null
          commission_status?: string | null
          commission_value?: number | null
          created_at?: string
          id?: string
          kind: string
          name: string
          professional_id?: string | null
          quantity?: number | null
          ref_id?: string | null
          tenant_id: string
          unit_price?: number
        }
        Update: {
          commanda_id?: string
          commission_pct?: number | null
          commission_status?: string | null
          commission_value?: number | null
          created_at?: string
          id?: string
          kind?: string
          name?: string
          professional_id?: string | null
          quantity?: number | null
          ref_id?: string | null
          tenant_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "commanda_items_commanda_id_fkey"
            columns: ["commanda_id"]
            isOneToOne: false
            referencedRelation: "commandas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commanda_items_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commanda_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      commandas: {
        Row: {
          client_id: string | null
          client_name: string | null
          closed_at: string | null
          created_at: string
          discount: number | null
          id: string
          number: number
          payment_method: string | null
          status: string | null
          subtotal: number | null
          tenant_id: string
          total: number | null
        }
        Insert: {
          client_id?: string | null
          client_name?: string | null
          closed_at?: string | null
          created_at?: string
          discount?: number | null
          id?: string
          number: number
          payment_method?: string | null
          status?: string | null
          subtotal?: number | null
          tenant_id: string
          total?: number | null
        }
        Update: {
          client_id?: string | null
          client_name?: string | null
          closed_at?: string | null
          created_at?: string
          discount?: number | null
          id?: string
          number?: number
          payment_method?: string | null
          status?: string | null
          subtotal?: number | null
          tenant_id?: string
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "commandas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean | null
          created_at: string
          id: string
          name: string
          price: number
          stock: number | null
          tenant_id: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          id?: string
          name: string
          price?: number
          stock?: number | null
          tenant_id: string
        }
        Update: {
          active?: boolean | null
          created_at?: string
          id?: string
          name?: string
          price?: number
          stock?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          active: boolean | null
          auth_user_id: string | null
          commission_pct: number | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          lunch_end: string | null
          lunch_start: string | null
          photo_url: string | null
          role_label: string | null
          specialty: string | null
          tenant_id: string
          whatsapp: string | null
        }
        Insert: {
          active?: boolean | null
          auth_user_id?: string | null
          commission_pct?: number | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          lunch_end?: string | null
          lunch_start?: string | null
          photo_url?: string | null
          role_label?: string | null
          specialty?: string | null
          tenant_id: string
          whatsapp?: string | null
        }
        Update: {
          active?: boolean | null
          auth_user_id?: string | null
          commission_pct?: number | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          lunch_end?: string | null
          lunch_start?: string | null
          photo_url?: string | null
          role_label?: string | null
          specialty?: string | null
          tenant_id?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professionals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_tenant_id: string | null
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
        }
        Insert: {
          active_tenant_id?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
        }
        Update: {
          active_tenant_id?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_tenant_id_fkey"
            columns: ["active_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean | null
          category: string | null
          created_at: string
          duration_min: number
          id: string
          name: string
          price: number
          tenant_id: string
          vip_only: boolean | null
        }
        Insert: {
          active?: boolean | null
          category?: string | null
          created_at?: string
          duration_min?: number
          id?: string
          name: string
          price?: number
          tenant_id: string
          vip_only?: boolean | null
        }
        Update: {
          active?: boolean | null
          category?: string | null
          created_at?: string
          duration_min?: number
          id?: string
          name?: string
          price?: number
          tenant_id?: string
          vip_only?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscribers: {
        Row: {
          client_id: string | null
          cpf: string
          created_at: string
          full_name: string
          id: string
          last_cut_at: string | null
          next_due_at: string | null
          plan: string | null
          price: number | null
          status: string | null
          tenant_id: string
          whatsapp: string | null
        }
        Insert: {
          client_id?: string | null
          cpf: string
          created_at?: string
          full_name: string
          id?: string
          last_cut_at?: string | null
          next_due_at?: string | null
          plan?: string | null
          price?: number | null
          status?: string | null
          tenant_id: string
          whatsapp?: string | null
        }
        Update: {
          client_id?: string | null
          cpf?: string
          created_at?: string
          full_name?: string
          id?: string
          last_cut_at?: string | null
          next_due_at?: string | null
          plan?: string | null
          price?: number | null
          status?: string | null
          tenant_id?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscribers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscribers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          close_hour: number | null
          lunch_end: number | null
          lunch_start: number | null
          message_client_template: string | null
          message_pro_template: string | null
          open_hour: number | null
          tenant_id: string
          updated_at: string
          vip_days: number[] | null
          vip_mode: string
          whatsapp_instance: string | null
          whatsapp_token: string | null
          work_days: number[] | null
        }
        Insert: {
          close_hour?: number | null
          lunch_end?: number | null
          lunch_start?: number | null
          message_client_template?: string | null
          message_pro_template?: string | null
          open_hour?: number | null
          tenant_id: string
          updated_at?: string
          vip_days?: number[] | null
          vip_mode?: string
          whatsapp_instance?: string | null
          whatsapp_token?: string | null
          work_days?: number[] | null
        }
        Update: {
          close_hour?: number | null
          lunch_end?: number | null
          lunch_start?: number | null
          message_client_template?: string | null
          message_pro_template?: string | null
          open_hour?: number | null
          tenant_id?: string
          updated_at?: string
          vip_days?: number[] | null
          vip_mode?: string
          whatsapp_instance?: string | null
          whatsapp_token?: string | null
          work_days?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          banner_url: string | null
          city: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          pix_holder: string | null
          pix_key: string | null
          plan: string | null
          plan_expires_at: string | null
          primary_color: string | null
          slot_minutes: number | null
          slug: string
          state: string | null
          status: string | null
          subtitle: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          banner_url?: string | null
          city?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          pix_holder?: string | null
          pix_key?: string | null
          plan?: string | null
          plan_expires_at?: string | null
          primary_color?: string | null
          slot_minutes?: number | null
          slug: string
          state?: string | null
          status?: string | null
          subtitle?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          banner_url?: string | null
          city?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          pix_holder?: string | null
          pix_key?: string | null
          plan?: string | null
          plan_expires_at?: string | null
          primary_color?: string | null
          slot_minutes?: number | null
          slug?: string
          state?: string | null
          status?: string | null
          subtitle?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: "super_admin" | "owner" | "staff" | "barber"
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
      app_role: ["super_admin", "owner", "staff", "barber"],
    },
  },
} as const
