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
          cancellation_token: string | null
          cancelled_at: string | null
          cancelled_by: string | null
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
          subscription_id: string | null
          tenant_id: string
        }
        Insert: {
          cancellation_token?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
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
          subscription_id?: string | null
          tenant_id: string
        }
        Update: {
          cancellation_token?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
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
          subscription_id?: string | null
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
            foreignKeyName: "appointments_subscription_tenant_fk"
            columns: ["subscription_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "client_subscriptions"
            referencedColumns: ["id", "tenant_id"]
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
          account_id: string | null
          affects_cash: boolean
          affects_dre: boolean
          amount: number
          canceled_at: string | null
          canceled_by: string | null
          cancellation_reason: string | null
          category: string | null
          category_id: string | null
          client_id: string | null
          commanda_id: string | null
          competence_date: string
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          document_number: string | null
          due_date: string | null
          id: string
          installment_count: number | null
          installment_number: number | null
          kind: string
          movement_date: string
          notes: string | null
          origin_label: string | null
          paid_at: string | null
          paid_by: string | null
          payment_method: string | null
          professional_id: string | null
          proof_url: string | null
          reference_id: string | null
          reference_type: string | null
          series_id: string | null
          settlement_id: string | null
          source: string
          status: string
          supplier_name: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          affects_cash?: boolean
          affects_dre?: boolean
          amount: number
          canceled_at?: string | null
          canceled_by?: string | null
          cancellation_reason?: string | null
          category?: string | null
          category_id?: string | null
          client_id?: string | null
          commanda_id?: string | null
          competence_date?: string
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_number?: string | null
          due_date?: string | null
          id?: string
          installment_count?: number | null
          installment_number?: number | null
          kind: string
          movement_date?: string
          notes?: string | null
          origin_label?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_method?: string | null
          professional_id?: string | null
          proof_url?: string | null
          reference_id?: string | null
          reference_type?: string | null
          series_id?: string | null
          settlement_id?: string | null
          source?: string
          status?: string
          supplier_name?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          affects_cash?: boolean
          affects_dre?: boolean
          amount?: number
          canceled_at?: string | null
          canceled_by?: string | null
          cancellation_reason?: string | null
          category?: string | null
          category_id?: string | null
          client_id?: string | null
          commanda_id?: string | null
          competence_date?: string
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_number?: string | null
          due_date?: string | null
          id?: string
          installment_count?: number | null
          installment_number?: number | null
          kind?: string
          movement_date?: string
          notes?: string | null
          origin_label?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_method?: string | null
          professional_id?: string | null
          proof_url?: string | null
          reference_id?: string | null
          reference_type?: string | null
          series_id?: string | null
          settlement_id?: string | null
          source?: string
          status?: string
          supplier_name?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_commanda_id_fkey"
            columns: ["commanda_id"]
            isOneToOne: false
            referencedRelation: "commandas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "commission_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      client_subscriptions: {
        Row: {
          auto_renew: boolean
          benefit_cycle_started_at: string
          canceled_at: string | null
          client_id: string | null
          cpf: string | null
          created_at: string
          discount: number
          ends_at: string | null
          enrollment_fee: number
          id: string
          legacy_subscriber_id: string | null
          next_due_at: string | null
          notes: string | null
          plan_id: string
          price: number
          sessions_remaining: number | null
          sessions_total: number | null
          sessions_used: number
          starts_at: string
          status: string
          subscriber_name: string
          suspended_at: string | null
          tenant_id: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          auto_renew?: boolean
          benefit_cycle_started_at: string
          canceled_at?: string | null
          client_id?: string | null
          cpf?: string | null
          created_at?: string
          discount?: number
          ends_at?: string | null
          enrollment_fee?: number
          id?: string
          legacy_subscriber_id?: string | null
          next_due_at?: string | null
          notes?: string | null
          plan_id: string
          price?: number
          sessions_remaining?: number | null
          sessions_total?: number | null
          sessions_used?: number
          starts_at?: string
          status?: string
          subscriber_name: string
          suspended_at?: string | null
          tenant_id: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          auto_renew?: boolean
          benefit_cycle_started_at?: string
          canceled_at?: string | null
          client_id?: string | null
          cpf?: string | null
          created_at?: string
          discount?: number
          ends_at?: string | null
          enrollment_fee?: number
          id?: string
          legacy_subscriber_id?: string | null
          next_due_at?: string | null
          notes?: string | null
          plan_id?: string
          price?: number
          sessions_remaining?: number | null
          sessions_total?: number | null
          sessions_used?: number
          starts_at?: string
          status?: string
          subscriber_name?: string
          suspended_at?: string | null
          tenant_id?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_subscriptions_legacy_subscriber_id_fkey"
            columns: ["legacy_subscriber_id"]
            isOneToOne: true
            referencedRelation: "subscribers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_subscriptions_tenant_id_fkey"
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
          cpf: string | null
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
          cpf?: string | null
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
          cpf?: string | null
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
          unit_cost: number
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
          unit_cost?: number
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
          unit_cost?: number
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
            foreignKeyName: "commanda_items_commanda_tenant_fk"
            columns: ["commanda_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "commandas"
            referencedColumns: ["id", "tenant_id"]
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
      commanda_payments: {
        Row: {
          amount: number
          commanda_id: string
          created_at: string
          id: string
          method: string
          received_amount: number
          tenant_id: string
        }
        Insert: {
          amount: number
          commanda_id: string
          created_at?: string
          id?: string
          method: string
          received_amount?: number
          tenant_id: string
        }
        Update: {
          amount?: number
          commanda_id?: string
          created_at?: string
          id?: string
          method?: string
          received_amount?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commanda_payments_commanda_id_fkey"
            columns: ["commanda_id"]
            isOneToOne: false
            referencedRelation: "commandas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commanda_payments_commanda_tenant_fk"
            columns: ["commanda_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "commandas"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "commanda_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      commandas: {
        Row: {
          addition: number
          amount_received: number
          appointment_id: string | null
          cancellation_reason: string | null
          change_amount: number
          client_id: string | null
          client_name: string | null
          closed_at: string | null
          cost_center_id: string | null
          created_at: string
          discount: number | null
          id: string
          notes: string | null
          number: number
          payment_method: string | null
          scheduled_at: string | null
          source: string | null
          status: string | null
          subscription_id: string | null
          subtotal: number | null
          tenant_id: string
          total: number | null
          updated_at: string
        }
        Insert: {
          addition?: number
          amount_received?: number
          appointment_id?: string | null
          cancellation_reason?: string | null
          change_amount?: number
          client_id?: string | null
          client_name?: string | null
          closed_at?: string | null
          cost_center_id?: string | null
          created_at?: string
          discount?: number | null
          id?: string
          notes?: string | null
          number: number
          payment_method?: string | null
          scheduled_at?: string | null
          source?: string | null
          status?: string | null
          subscription_id?: string | null
          subtotal?: number | null
          tenant_id: string
          total?: number | null
          updated_at?: string
        }
        Update: {
          addition?: number
          amount_received?: number
          appointment_id?: string | null
          cancellation_reason?: string | null
          change_amount?: number
          client_id?: string | null
          client_name?: string | null
          closed_at?: string | null
          cost_center_id?: string | null
          created_at?: string
          discount?: number | null
          id?: string
          notes?: string | null
          number?: number
          payment_method?: string | null
          scheduled_at?: string | null
          source?: string | null
          status?: string | null
          subscription_id?: string | null
          subtotal?: number | null
          tenant_id?: string
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commandas_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandas_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandas_subscription_tenant_fk"
            columns: ["subscription_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "client_subscriptions"
            referencedColumns: ["id", "tenant_id"]
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
      commission_adjustments: {
        Row: {
          adjustment_type: string
          amount: number
          applied_at: string | null
          canceled_at: string | null
          competence_date: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          nature: string
          notes: string | null
          professional_id: string
          settlement_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          adjustment_type: string
          amount: number
          applied_at?: string | null
          canceled_at?: string | null
          competence_date?: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          nature: string
          notes?: string | null
          professional_id: string
          settlement_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          adjustment_type?: string
          amount?: number
          applied_at?: string | null
          canceled_at?: string | null
          competence_date?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          nature?: string
          notes?: string | null
          professional_id?: string
          settlement_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_adjustments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_adjustments_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "commission_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_adjustments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_entries: {
        Row: {
          canceled_at: string | null
          cancellation_reason: string | null
          commanda_id: string
          commanda_item_id: string
          commission_amount: number
          commission_pct: number
          competence_date: string
          cost_center_id: string | null
          created_by: string | null
          due_date: string
          generated_at: string
          gross_amount: number
          id: string
          item_kind: string
          item_name: string
          paid_at: string | null
          payable_movement_id: string | null
          professional_id: string
          quantity: number
          reference_id: string | null
          rule_description: string | null
          rule_id: string | null
          rule_scope: string
          scheduled_at: string | null
          settlement_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          canceled_at?: string | null
          cancellation_reason?: string | null
          commanda_id: string
          commanda_item_id: string
          commission_amount?: number
          commission_pct?: number
          competence_date: string
          cost_center_id?: string | null
          created_by?: string | null
          due_date: string
          generated_at?: string
          gross_amount?: number
          id?: string
          item_kind: string
          item_name: string
          paid_at?: string | null
          payable_movement_id?: string | null
          professional_id: string
          quantity?: number
          reference_id?: string | null
          rule_description?: string | null
          rule_id?: string | null
          rule_scope?: string
          scheduled_at?: string | null
          settlement_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          canceled_at?: string | null
          cancellation_reason?: string | null
          commanda_id?: string
          commanda_item_id?: string
          commission_amount?: number
          commission_pct?: number
          competence_date?: string
          cost_center_id?: string | null
          created_by?: string | null
          due_date?: string
          generated_at?: string
          gross_amount?: number
          id?: string
          item_kind?: string
          item_name?: string
          paid_at?: string | null
          payable_movement_id?: string | null
          professional_id?: string
          quantity?: number
          reference_id?: string | null
          rule_description?: string | null
          rule_id?: string | null
          rule_scope?: string
          scheduled_at?: string | null
          settlement_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_entries_commanda_id_fkey"
            columns: ["commanda_id"]
            isOneToOne: false
            referencedRelation: "commandas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_entries_commanda_item_id_fkey"
            columns: ["commanda_item_id"]
            isOneToOne: true
            referencedRelation: "commanda_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_entries_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_entries_payable_movement_id_fkey"
            columns: ["payable_movement_id"]
            isOneToOne: false
            referencedRelation: "cash_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_entries_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_entries_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "commission_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_entries_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "commission_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          active: boolean
          change_reason: string | null
          created_at: string
          created_by: string | null
          id: string
          item_kind: string
          percentage: number
          professional_id: string | null
          reference_id: string | null
          rule_scope: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          change_reason?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_kind: string
          percentage: number
          professional_id?: string | null
          reference_id?: string | null
          rule_scope: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          change_reason?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_kind?: string
          percentage?: number
          professional_id?: string | null
          reference_id?: string | null
          rule_scope?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_settlement_items: {
        Row: {
          amount: number
          commission_entry_id: string
          created_at: string
          id: string
          settlement_id: string
          tenant_id: string
        }
        Insert: {
          amount: number
          commission_entry_id: string
          created_at?: string
          id?: string
          settlement_id: string
          tenant_id: string
        }
        Update: {
          amount?: number
          commission_entry_id?: string
          created_at?: string
          id?: string
          settlement_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_settlement_items_commission_entry_id_fkey"
            columns: ["commission_entry_id"]
            isOneToOne: true
            referencedRelation: "commission_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_settlement_items_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "commission_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_settlement_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_settlements: {
        Row: {
          account_id: string | null
          cash_movement_id: string | null
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          credit_amount: number
          debit_amount: number
          gross_amount: number
          id: string
          net_amount: number
          notes: string | null
          paid_at: string | null
          payment_date: string | null
          payment_method: string | null
          period_end: string
          period_start: string
          professional_id: string
          proof_url: string | null
          reversal_reason: string | null
          reversed_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          cash_movement_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_amount?: number
          debit_amount?: number
          gross_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          paid_at?: string | null
          payment_date?: string | null
          payment_method?: string | null
          period_end: string
          period_start: string
          professional_id: string
          proof_url?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          cash_movement_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_amount?: number
          debit_amount?: number
          gross_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          paid_at?: string | null
          payment_date?: string | null
          payment_method?: string | null
          period_end?: string
          period_start?: string
          professional_id?: string
          proof_url?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_settlements_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_settlements_cash_movement_id_fkey"
            columns: ["cash_movement_id"]
            isOneToOne: false
            referencedRelation: "cash_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_settlements_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_settlements_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_settlements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_centers: {
        Row: {
          active: boolean
          code: string | null
          created_at: string
          id: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code?: string | null
          created_at?: string
          id?: string
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_booking_accounts: {
        Row: {
          client_id: string
          cpf_hash: string
          created_at: string
          failed_login_attempts: number
          id: string
          last_login_at: string | null
          locked_until: string | null
          password_hash: string
          tenant_id: string
          updated_at: string
          whatsapp_consent_at: string | null
        }
        Insert: {
          client_id: string
          cpf_hash: string
          created_at?: string
          failed_login_attempts?: number
          id?: string
          last_login_at?: string | null
          locked_until?: string | null
          password_hash: string
          tenant_id: string
          updated_at?: string
          whatsapp_consent_at?: string | null
        }
        Update: {
          client_id?: string
          cpf_hash?: string
          created_at?: string
          failed_login_attempts?: number
          id?: string
          last_login_at?: string | null
          locked_until?: string | null
          password_hash?: string
          tenant_id?: string
          updated_at?: string
          whatsapp_consent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_booking_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_booking_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_booking_activation_codes: {
        Row: {
          client_id: string
          code_hash: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          tenant_id: string
          used_at: string | null
        }
        Insert: {
          client_id: string
          code_hash: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          tenant_id: string
          used_at?: string | null
        }
        Update: {
          client_id?: string
          code_hash?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          tenant_id?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_booking_activation_codes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_booking_activation_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_booking_rate_limits: {
        Row: {
          attempts: number
          blocked_until: string | null
          fingerprint_hash: string
          scope: string
          tenant_id: string
          updated_at: string
          window_started_at: string
        }
        Insert: {
          attempts?: number
          blocked_until?: string | null
          fingerprint_hash: string
          scope: string
          tenant_id: string
          updated_at?: string
          window_started_at?: string
        }
        Update: {
          attempts?: number
          blocked_until?: string | null
          fingerprint_hash?: string
          scope?: string
          tenant_id?: string
          updated_at?: string
          window_started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_booking_rate_limits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_booking_sessions: {
        Row: {
          account_id: string
          created_at: string
          expires_at: string
          id: string
          last_seen_at: string
          tenant_id: string
          token_hash: string
        }
        Insert: {
          account_id: string
          created_at?: string
          expires_at: string
          id?: string
          last_seen_at?: string
          tenant_id: string
          token_hash: string
        }
        Update: {
          account_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          last_seen_at?: string
          tenant_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_booking_sessions_account_id_tenant_id_fkey"
            columns: ["account_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer_booking_accounts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "customer_booking_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_accounts: {
        Row: {
          account_type: string
          active: boolean
          created_at: string
          id: string
          name: string
          opening_balance: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_type?: string
          active?: boolean
          created_at?: string
          id?: string
          name: string
          opening_balance?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          account_type?: string
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          opening_balance?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          new_data: Json | null
          old_data: Json | null
          reason: string | null
          source_entity_id: string | null
          source_entity_type: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          reason?: string | null
          source_entity_id?: string | null
          source_entity_type?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          reason?: string | null
          source_entity_id?: string | null
          source_entity_type?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_categories: {
        Row: {
          active: boolean
          created_at: string
          dre_group: string
          id: string
          movement_kind: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          dre_group: string
          id?: string
          movement_kind: string
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          dre_group?: string
          id?: string
          movement_kind?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_billing_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          charge_id: string | null
          contract_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          provider_event_id: string | null
          source: string
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          charge_id?: string | null
          contract_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          provider_event_id?: string | null
          source?: string
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          charge_id?: string | null
          contract_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          provider_event_id?: string | null
          source?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_billing_audit_log_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "platform_billing_charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_billing_audit_log_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "platform_billing_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_billing_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_billing_charges: {
        Row: {
          access_applied_at: string | null
          access_reversed_at: string | null
          amount: number
          bank_slip_url: string | null
          billing_type: string
          confirmed_at: string | null
          contract_id: string
          coverage_end: string
          coverage_start: string
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string
          environment: string
          error_message: string | null
          external_reference: string
          id: string
          idempotency_key: string
          invoice_url: string | null
          last_provider_event_at: string | null
          last_provider_event_id: string | null
          last_synced_at: string | null
          plan_id: string
          provider: string
          provider_customer_id: string | null
          provider_payment_id: string | null
          provider_status: string | null
          received_at: string | null
          refunded_at: string | null
          source: string
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          access_applied_at?: string | null
          access_reversed_at?: string | null
          amount: number
          bank_slip_url?: string | null
          billing_type?: string
          confirmed_at?: string | null
          contract_id: string
          coverage_end: string
          coverage_start: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date: string
          environment: string
          error_message?: string | null
          external_reference: string
          id?: string
          idempotency_key: string
          invoice_url?: string | null
          last_provider_event_at?: string | null
          last_provider_event_id?: string | null
          last_synced_at?: string | null
          plan_id: string
          provider?: string
          provider_customer_id?: string | null
          provider_payment_id?: string | null
          provider_status?: string | null
          received_at?: string | null
          refunded_at?: string | null
          source?: string
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          access_applied_at?: string | null
          access_reversed_at?: string | null
          amount?: number
          bank_slip_url?: string | null
          billing_type?: string
          confirmed_at?: string | null
          contract_id?: string
          coverage_end?: string
          coverage_start?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string
          environment?: string
          error_message?: string | null
          external_reference?: string
          id?: string
          idempotency_key?: string
          invoice_url?: string | null
          last_provider_event_at?: string | null
          last_provider_event_id?: string | null
          last_synced_at?: string | null
          plan_id?: string
          provider?: string
          provider_customer_id?: string | null
          provider_payment_id?: string | null
          provider_status?: string | null
          received_at?: string | null
          refunded_at?: string | null
          source?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_billing_charges_contract_tenant_fk"
            columns: ["contract_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "platform_billing_contracts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "platform_billing_charges_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "platform_billing_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_billing_charges_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_billing_contracts: {
        Row: {
          amount_snapshot: number
          auto_renew: boolean
          billing_type: string
          cancel_at_period_end: boolean
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          current_period_end: string | null
          current_period_start: string | null
          due_day: number
          id: string
          interval_months_snapshot: number
          last_paid_at: string | null
          next_due_date: string | null
          past_due_since: string | null
          plan_id: string
          starts_on: string
          status: string
          suspended_at: string | null
          tenant_id: string
          trial_ends_on: string | null
          trial_starts_on: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_snapshot: number
          auto_renew?: boolean
          billing_type?: string
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          due_day?: number
          id?: string
          interval_months_snapshot: number
          last_paid_at?: string | null
          next_due_date?: string | null
          past_due_since?: string | null
          plan_id: string
          starts_on?: string
          status?: string
          suspended_at?: string | null
          tenant_id: string
          trial_ends_on?: string | null
          trial_starts_on?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_snapshot?: number
          auto_renew?: boolean
          billing_type?: string
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          due_day?: number
          id?: string
          interval_months_snapshot?: number
          last_paid_at?: string | null
          next_due_date?: string | null
          past_due_since?: string | null
          plan_id?: string
          starts_on?: string
          status?: string
          suspended_at?: string | null
          tenant_id?: string
          trial_ends_on?: string | null
          trial_starts_on?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_billing_contracts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "platform_billing_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_billing_contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_billing_plans: {
        Row: {
          active: boolean
          amount: number
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          interval_months: number
          name: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          amount: number
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          interval_months?: number
          name: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          amount?: number
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          interval_months?: number
          name?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      platform_billing_provider_operations: {
        Row: {
          attempts: number
          charge_id: string | null
          completed_at: string | null
          contract_id: string | null
          created_at: string
          environment: string
          id: string
          last_error: string | null
          operation_key: string
          operation_type: string
          provider: string
          provider_resource_id: string | null
          request_fingerprint: string | null
          request_payload: Json
          response_payload: Json
          started_at: string | null
          status: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          charge_id?: string | null
          completed_at?: string | null
          contract_id?: string | null
          created_at?: string
          environment: string
          id?: string
          last_error?: string | null
          operation_key: string
          operation_type: string
          provider?: string
          provider_resource_id?: string | null
          request_fingerprint?: string | null
          request_payload?: Json
          response_payload?: Json
          started_at?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          charge_id?: string | null
          completed_at?: string | null
          contract_id?: string | null
          created_at?: string
          environment?: string
          id?: string
          last_error?: string | null
          operation_key?: string
          operation_type?: string
          provider?: string
          provider_resource_id?: string | null
          request_fingerprint?: string | null
          request_payload?: Json
          response_payload?: Json
          started_at?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_billing_provider_operations_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "platform_billing_charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_billing_provider_operations_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "platform_billing_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_billing_provider_operations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_billing_settings: {
        Row: {
          auto_suspend: boolean
          created_at: string
          default_billing_type: string
          discount_due_days: number
          discount_percentage: number
          enabled: boolean
          environment: string
          fine_percentage: number
          grace_days: number
          id: string
          interest_percentage: number
          issue_days_before: number
          notification_disabled: boolean
          platform_notification_time: string
          platform_overdue_days_after: number[]
          platform_overdue_enabled: boolean
          platform_overdue_template: string
          platform_payment_confirmation_enabled: boolean
          platform_payment_confirmation_template: string
          platform_payment_reminder_days_before: number[]
          platform_payment_reminder_enabled: boolean
          platform_payment_reminder_template: string
          platform_trial_reminder_days_before: number[]
          platform_trial_reminder_enabled: boolean
          platform_trial_reminder_template: string
          provider: string
          updated_at: string
          updated_by: string | null
          webhook_environment: string | null
          webhook_id: string | null
          webhook_last_synced_at: string | null
          webhook_status: string
          whatsapp_enabled: boolean
          whatsapp_sender_tenant_id: string | null
        }
        Insert: {
          auto_suspend?: boolean
          created_at?: string
          default_billing_type?: string
          discount_due_days?: number
          discount_percentage?: number
          enabled?: boolean
          environment?: string
          fine_percentage?: number
          grace_days?: number
          id?: string
          interest_percentage?: number
          issue_days_before?: number
          notification_disabled?: boolean
          platform_notification_time?: string
          platform_overdue_days_after?: number[]
          platform_overdue_enabled?: boolean
          platform_overdue_template?: string
          platform_payment_confirmation_enabled?: boolean
          platform_payment_confirmation_template?: string
          platform_payment_reminder_days_before?: number[]
          platform_payment_reminder_enabled?: boolean
          platform_payment_reminder_template?: string
          platform_trial_reminder_days_before?: number[]
          platform_trial_reminder_enabled?: boolean
          platform_trial_reminder_template?: string
          provider?: string
          updated_at?: string
          updated_by?: string | null
          webhook_environment?: string | null
          webhook_id?: string | null
          webhook_last_synced_at?: string | null
          webhook_status?: string
          whatsapp_enabled?: boolean
          whatsapp_sender_tenant_id?: string | null
        }
        Update: {
          auto_suspend?: boolean
          created_at?: string
          default_billing_type?: string
          discount_due_days?: number
          discount_percentage?: number
          enabled?: boolean
          environment?: string
          fine_percentage?: number
          grace_days?: number
          id?: string
          interest_percentage?: number
          issue_days_before?: number
          notification_disabled?: boolean
          platform_notification_time?: string
          platform_overdue_days_after?: number[]
          platform_overdue_enabled?: boolean
          platform_overdue_template?: string
          platform_payment_confirmation_enabled?: boolean
          platform_payment_confirmation_template?: string
          platform_payment_reminder_days_before?: number[]
          platform_payment_reminder_enabled?: boolean
          platform_payment_reminder_template?: string
          platform_trial_reminder_days_before?: number[]
          platform_trial_reminder_enabled?: boolean
          platform_trial_reminder_template?: string
          provider?: string
          updated_at?: string
          updated_by?: string | null
          webhook_environment?: string | null
          webhook_id?: string | null
          webhook_last_synced_at?: string | null
          webhook_status?: string
          whatsapp_enabled?: boolean
          whatsapp_sender_tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_billing_settings_whatsapp_sender_fk"
            columns: ["whatsapp_sender_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_billing_webhook_events: {
        Row: {
          attempts: number
          available_at: string
          charge_id: string | null
          claimed_at: string | null
          claimed_by: string | null
          environment: string
          event_type: string
          external_reference: string | null
          id: string
          last_error: string | null
          payload: Json
          processed_at: string | null
          processing_status: string
          provider: string
          provider_created_at: string | null
          provider_event_id: string
          provider_payment_id: string | null
          received_at: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          charge_id?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          environment: string
          event_type: string
          external_reference?: string | null
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          processing_status?: string
          provider?: string
          provider_created_at?: string | null
          provider_event_id: string
          provider_payment_id?: string | null
          received_at?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          charge_id?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          environment?: string
          event_type?: string
          external_reference?: string | null
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          processing_status?: string
          provider?: string
          provider_created_at?: string | null
          provider_event_id?: string
          provider_payment_id?: string | null
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_billing_webhook_events_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "platform_billing_charges"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_billing_worker_runs: {
        Row: {
          action: string
          completed_at: string | null
          environment: string
          error_message: string | null
          id: string
          started_at: string
          status: string
          summary: Json
        }
        Insert: {
          action?: string
          completed_at?: string | null
          environment: string
          error_message?: string | null
          id?: string
          started_at?: string
          status?: string
          summary?: Json
        }
        Update: {
          action?: string
          completed_at?: string | null
          environment?: string
          error_message?: string | null
          id?: string
          started_at?: string
          status?: string
          summary?: Json
        }
        Relationships: []
      }
      products: {
        Row: {
          active: boolean | null
          cost_price: number
          created_at: string
          id: string
          name: string
          price: number
          stock: number | null
          tenant_id: string
        }
        Insert: {
          active?: boolean | null
          cost_price?: number
          created_at?: string
          id?: string
          name: string
          price?: number
          stock?: number | null
          tenant_id: string
        }
        Update: {
          active?: boolean | null
          cost_price?: number
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
          blocked_dates: string[] | null
          commission_pct: number | null
          cost_center_id: string | null
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
          work_days: number[] | null
        }
        Insert: {
          active?: boolean | null
          auth_user_id?: string | null
          blocked_dates?: string[] | null
          commission_pct?: number | null
          cost_center_id?: string | null
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
          work_days?: number[] | null
        }
        Update: {
          active?: boolean | null
          auth_user_id?: string | null
          blocked_dates?: string[] | null
          commission_pct?: number | null
          cost_center_id?: string | null
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
          work_days?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "professionals_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
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
      subscription_charges: {
        Row: {
          amount: number
          billing_period_end: string | null
          billing_period_start: string | null
          cash_movement_id: string | null
          client_id: string | null
          created_at: string
          description: string | null
          due_date: string
          external_provider: string | null
          external_reference: string | null
          id: string
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          status: string
          subscription_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          cash_movement_id?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          due_date: string
          external_provider?: string | null
          external_reference?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          status?: string
          subscription_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          cash_movement_id?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string
          external_provider?: string | null
          external_reference?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          status?: string
          subscription_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_charges_cash_movement_id_fkey"
            columns: ["cash_movement_id"]
            isOneToOne: false
            referencedRelation: "cash_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_charges_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_charges_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "client_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_charges_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_module_settings: {
        Row: {
          asaas_enabled: boolean
          billing_message: string
          cancellation_policy: string | null
          created_at: string
          default_allow_cancellation: boolean
          default_allow_reschedule: boolean
          default_allow_rollover: boolean
          default_validity_days: number
          grace_days: number
          overdue_message: string
          payment_confirmation_message: string
          renewal_rule: string | null
          tenant_id: string
          updated_at: string
          usage_policy: string | null
          whatsapp_enabled: boolean
        }
        Insert: {
          asaas_enabled?: boolean
          billing_message?: string
          cancellation_policy?: string | null
          created_at?: string
          default_allow_cancellation?: boolean
          default_allow_reschedule?: boolean
          default_allow_rollover?: boolean
          default_validity_days?: number
          grace_days?: number
          overdue_message?: string
          payment_confirmation_message?: string
          renewal_rule?: string | null
          tenant_id: string
          updated_at?: string
          usage_policy?: string | null
          whatsapp_enabled?: boolean
        }
        Update: {
          asaas_enabled?: boolean
          billing_message?: string
          cancellation_policy?: string | null
          created_at?: string
          default_allow_cancellation?: boolean
          default_allow_reschedule?: boolean
          default_allow_rollover?: boolean
          default_validity_days?: number
          grace_days?: number
          overdue_message?: string
          payment_confirmation_message?: string
          renewal_rule?: string | null
          tenant_id?: string
          updated_at?: string
          usage_policy?: string | null
          whatsapp_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "subscription_module_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plan_benefits: {
        Row: {
          active: boolean
          benefit_type: string
          created_at: string
          description: string | null
          discount_pct: number | null
          id: string
          name: string
          plan_id: string
          product_id: string | null
          quantity: number | null
          rules: Json
          service_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          benefit_type?: string
          created_at?: string
          description?: string | null
          discount_pct?: number | null
          id?: string
          name: string
          plan_id: string
          product_id?: string | null
          quantity?: number | null
          rules?: Json
          service_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          benefit_type?: string
          created_at?: string
          description?: string | null
          discount_pct?: number | null
          id?: string
          name?: string
          plan_id?: string
          product_id?: string | null
          quantity?: number | null
          rules?: Json
          service_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_plan_benefits_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_plan_benefits_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_plan_benefits_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_plan_benefits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          allow_cancellation: boolean
          allow_extras: boolean
          allow_multiple_same_day: boolean
          allow_reschedule: boolean
          allow_rollover: boolean
          asaas_enabled: boolean
          automatic_notifications: boolean
          automatic_renewal: boolean
          automatic_settlement: boolean
          billing_cycle: string
          billing_mode: string
          booking_show_benefits: boolean
          booking_show_discount: boolean
          booking_show_name: boolean
          booking_show_remaining: boolean
          booking_show_validity: boolean
          category: string | null
          cost_center: string | null
          coupon_allowed: boolean
          created_at: string
          description: string | null
          discount_allowed: boolean
          discount_value: number
          duration_days: number | null
          enrollment_fee: number
          enrollment_fee_allowed: boolean
          financial_account_id: string | null
          financial_category_id: string | null
          id: string
          image_url: string | null
          included_services_only: boolean
          max_per_day: number | null
          max_per_month: number | null
          max_per_week: number | null
          model: string
          name: string
          pix_enabled: boolean
          price: number
          session_limit: number | null
          session_validity_days: number | null
          sessions_expire: boolean
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          allow_cancellation?: boolean
          allow_extras?: boolean
          allow_multiple_same_day?: boolean
          allow_reschedule?: boolean
          allow_rollover?: boolean
          asaas_enabled?: boolean
          automatic_notifications?: boolean
          automatic_renewal?: boolean
          automatic_settlement?: boolean
          billing_cycle?: string
          billing_mode?: string
          booking_show_benefits?: boolean
          booking_show_discount?: boolean
          booking_show_name?: boolean
          booking_show_remaining?: boolean
          booking_show_validity?: boolean
          category?: string | null
          cost_center?: string | null
          coupon_allowed?: boolean
          created_at?: string
          description?: string | null
          discount_allowed?: boolean
          discount_value?: number
          duration_days?: number | null
          enrollment_fee?: number
          enrollment_fee_allowed?: boolean
          financial_account_id?: string | null
          financial_category_id?: string | null
          id?: string
          image_url?: string | null
          included_services_only?: boolean
          max_per_day?: number | null
          max_per_month?: number | null
          max_per_week?: number | null
          model?: string
          name: string
          pix_enabled?: boolean
          price?: number
          session_limit?: number | null
          session_validity_days?: number | null
          sessions_expire?: boolean
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          allow_cancellation?: boolean
          allow_extras?: boolean
          allow_multiple_same_day?: boolean
          allow_reschedule?: boolean
          allow_rollover?: boolean
          asaas_enabled?: boolean
          automatic_notifications?: boolean
          automatic_renewal?: boolean
          automatic_settlement?: boolean
          billing_cycle?: string
          billing_mode?: string
          booking_show_benefits?: boolean
          booking_show_discount?: boolean
          booking_show_name?: boolean
          booking_show_remaining?: boolean
          booking_show_validity?: boolean
          category?: string | null
          cost_center?: string | null
          coupon_allowed?: boolean
          created_at?: string
          description?: string | null
          discount_allowed?: boolean
          discount_value?: number
          duration_days?: number | null
          enrollment_fee?: number
          enrollment_fee_allowed?: boolean
          financial_account_id?: string | null
          financial_category_id?: string | null
          id?: string
          image_url?: string | null
          included_services_only?: boolean
          max_per_day?: number | null
          max_per_month?: number | null
          max_per_week?: number | null
          model?: string
          name?: string
          pix_enabled?: boolean
          price?: number
          session_limit?: number | null
          session_validity_days?: number | null
          sessions_expire?: boolean
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_plans_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_plans_financial_category_id_fkey"
            columns: ["financial_category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_usages: {
        Row: {
          appointment_id: string | null
          benefit_id: string | null
          client_id: string | null
          commanda_id: string | null
          commanda_item_id: string | null
          created_at: string
          id: string
          notes: string | null
          professional_id: string | null
          quantity: number
          remaining_after: number | null
          service_id: string | null
          source: string
          subscription_id: string
          tenant_id: string
          used_at: string
        }
        Insert: {
          appointment_id?: string | null
          benefit_id?: string | null
          client_id?: string | null
          commanda_id?: string | null
          commanda_item_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          professional_id?: string | null
          quantity?: number
          remaining_after?: number | null
          service_id?: string | null
          source?: string
          subscription_id: string
          tenant_id: string
          used_at?: string
        }
        Update: {
          appointment_id?: string | null
          benefit_id?: string | null
          client_id?: string | null
          commanda_id?: string | null
          commanda_item_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          professional_id?: string | null
          quantity?: number
          remaining_after?: number | null
          service_id?: string | null
          source?: string
          subscription_id?: string
          tenant_id?: string
          used_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_usages_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_usages_benefit_id_fkey"
            columns: ["benefit_id"]
            isOneToOne: false
            referencedRelation: "subscription_plan_benefits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_usages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_usages_commanda_id_fkey"
            columns: ["commanda_id"]
            isOneToOne: false
            referencedRelation: "commandas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_usages_commanda_item_id_fkey"
            columns: ["commanda_item_id"]
            isOneToOne: false
            referencedRelation: "commanda_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_usages_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_usages_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_usages_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "client_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_usages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_billing_provider_customers: {
        Row: {
          address: string | null
          address_number: string | null
          city: string | null
          complement: string | null
          cpf_cnpj: string | null
          created_at: string
          created_by: string | null
          email: string | null
          environment: string
          external_reference: string
          id: string
          last_error: string | null
          last_synced_at: string | null
          legal_name: string
          notification_disabled: boolean
          phone: string | null
          postal_code: string | null
          preferred_billing_type: string
          provider: string
          provider_customer_id: string | null
          province: string | null
          state: string | null
          sync_status: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          address_number?: string | null
          city?: string | null
          complement?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          environment: string
          external_reference: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          legal_name: string
          notification_disabled?: boolean
          phone?: string | null
          postal_code?: string | null
          preferred_billing_type?: string
          provider?: string
          provider_customer_id?: string | null
          province?: string | null
          state?: string | null
          sync_status?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          address_number?: string | null
          city?: string | null
          complement?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          environment?: string
          external_reference?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          legal_name?: string
          notification_disabled?: boolean
          phone?: string | null
          postal_code?: string | null
          preferred_billing_type?: string
          provider?: string
          provider_customer_id?: string | null
          province?: string | null
          state?: string | null
          sync_status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_billing_provider_customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_booking_branding: {
        Row: {
          background_asset_id: string | null
          background_desktop_path: string | null
          background_mobile_path: string | null
          background_source_height: number | null
          background_source_mime: string | null
          background_source_path: string | null
          background_source_size: number | null
          background_source_width: number | null
          background_tablet_path: string | null
          created_at: string
          desktop_position_mode: string
          desktop_position_x: number
          desktop_position_y: number
          desktop_zoom: number
          hero_slogan: string
          mobile_position_mode: string
          mobile_position_x: number
          mobile_position_y: number
          mobile_zoom: number
          overlay_opacity: number
          show_logo: boolean
          show_name: boolean
          show_primary_button: boolean
          show_slogan: boolean
          show_subscriber_badge: boolean
          show_subscription_summary: boolean
          show_subtitle: boolean
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          background_asset_id?: string | null
          background_desktop_path?: string | null
          background_mobile_path?: string | null
          background_source_height?: number | null
          background_source_mime?: string | null
          background_source_path?: string | null
          background_source_size?: number | null
          background_source_width?: number | null
          background_tablet_path?: string | null
          created_at?: string
          desktop_position_mode?: string
          desktop_position_x?: number
          desktop_position_y?: number
          desktop_zoom?: number
          hero_slogan?: string
          mobile_position_mode?: string
          mobile_position_x?: number
          mobile_position_y?: number
          mobile_zoom?: number
          overlay_opacity?: number
          show_logo?: boolean
          show_name?: boolean
          show_primary_button?: boolean
          show_slogan?: boolean
          show_subscriber_badge?: boolean
          show_subscription_summary?: boolean
          show_subtitle?: boolean
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          background_asset_id?: string | null
          background_desktop_path?: string | null
          background_mobile_path?: string | null
          background_source_height?: number | null
          background_source_mime?: string | null
          background_source_path?: string | null
          background_source_size?: number | null
          background_source_width?: number | null
          background_tablet_path?: string | null
          created_at?: string
          desktop_position_mode?: string
          desktop_position_x?: number
          desktop_position_y?: number
          desktop_zoom?: number
          hero_slogan?: string
          mobile_position_mode?: string
          mobile_position_x?: number
          mobile_position_y?: number
          mobile_zoom?: number
          overlay_opacity?: number
          show_logo?: boolean
          show_name?: boolean
          show_primary_button?: boolean
          show_slogan?: boolean
          show_subscriber_badge?: boolean
          show_subscription_summary?: boolean
          show_subtitle?: boolean
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_booking_branding_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          close_hour: number | null
          closed_dates: string[]
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
          closed_dates?: string[]
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
          closed_dates?: string[]
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
      tenant_whatsapp_settings: {
        Row: {
          client_booking_template: string
          client_cancellation_template: string
          client_registration_template: string
          client_reminder_template: string
          client_reschedule_template: string
          connected_phone: string | null
          connection_status: string
          created_at: string
          enabled: boolean
          last_connection_error: string | null
          last_status_at: string | null
          message_templates_source: string
          notify_client_booking: boolean
          notify_client_cancellation: boolean
          notify_client_registration: boolean
          notify_client_reschedule: boolean
          notify_professional_booking: boolean
          notify_professional_cancellation: boolean
          notify_professional_reschedule: boolean
          professional_booking_template: string
          professional_cancellation_template: string
          professional_reschedule_template: string
          reminder_enabled: boolean
          reminder_minutes_before: number
          responsible_whatsapp: string | null
          session_id: string
          subscription_notification_time: string
          subscription_overdue_days_after: number[]
          subscription_overdue_enabled: boolean
          subscription_overdue_template: string
          subscription_payment_confirmation_enabled: boolean
          subscription_payment_confirmation_template: string
          subscription_payment_reminder_days_before: number[]
          subscription_payment_reminder_enabled: boolean
          subscription_payment_reminder_template: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          client_booking_template?: string
          client_cancellation_template?: string
          client_registration_template?: string
          client_reminder_template?: string
          client_reschedule_template?: string
          connected_phone?: string | null
          connection_status?: string
          created_at?: string
          enabled?: boolean
          last_connection_error?: string | null
          last_status_at?: string | null
          message_templates_source?: string
          notify_client_booking?: boolean
          notify_client_cancellation?: boolean
          notify_client_registration?: boolean
          notify_client_reschedule?: boolean
          notify_professional_booking?: boolean
          notify_professional_cancellation?: boolean
          notify_professional_reschedule?: boolean
          professional_booking_template?: string
          professional_cancellation_template?: string
          professional_reschedule_template?: string
          reminder_enabled?: boolean
          reminder_minutes_before?: number
          responsible_whatsapp?: string | null
          session_id: string
          subscription_notification_time?: string
          subscription_overdue_days_after?: number[]
          subscription_overdue_enabled?: boolean
          subscription_overdue_template?: string
          subscription_payment_confirmation_enabled?: boolean
          subscription_payment_confirmation_template?: string
          subscription_payment_reminder_days_before?: number[]
          subscription_payment_reminder_enabled?: boolean
          subscription_payment_reminder_template?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          client_booking_template?: string
          client_cancellation_template?: string
          client_registration_template?: string
          client_reminder_template?: string
          client_reschedule_template?: string
          connected_phone?: string | null
          connection_status?: string
          created_at?: string
          enabled?: boolean
          last_connection_error?: string | null
          last_status_at?: string | null
          message_templates_source?: string
          notify_client_booking?: boolean
          notify_client_cancellation?: boolean
          notify_client_registration?: boolean
          notify_client_reschedule?: boolean
          notify_professional_booking?: boolean
          notify_professional_cancellation?: boolean
          notify_professional_reschedule?: boolean
          professional_booking_template?: string
          professional_cancellation_template?: string
          professional_reschedule_template?: string
          reminder_enabled?: boolean
          reminder_minutes_before?: number
          responsible_whatsapp?: string | null
          session_id?: string
          subscription_notification_time?: string
          subscription_overdue_days_after?: number[]
          subscription_overdue_enabled?: boolean
          subscription_overdue_template?: string
          subscription_payment_confirmation_enabled?: boolean
          subscription_payment_confirmation_template?: string
          subscription_payment_reminder_days_before?: number[]
          subscription_payment_reminder_enabled?: boolean
          subscription_payment_reminder_template?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_whatsapp_settings_tenant_id_fkey"
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
          billing_blocked_at: string | null
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
          status_reason: string | null
          subtitle: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          banner_url?: string | null
          billing_blocked_at?: string | null
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
          status_reason?: string | null
          subtitle?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          banner_url?: string | null
          billing_blocked_at?: string | null
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
          status_reason?: string | null
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
      whatsapp_global_templates: {
        Row: {
          client_booking_template: string
          client_cancellation_template: string
          client_registration_template: string
          client_reminder_template: string
          client_reschedule_template: string
          created_at: string
          id: string
          professional_booking_template: string
          professional_cancellation_template: string
          professional_reschedule_template: string
          subscription_notification_time: string
          subscription_overdue_days_after: number[]
          subscription_overdue_enabled: boolean
          subscription_overdue_template: string
          subscription_payment_confirmation_enabled: boolean
          subscription_payment_confirmation_template: string
          subscription_payment_reminder_days_before: number[]
          subscription_payment_reminder_enabled: boolean
          subscription_payment_reminder_template: string
          updated_at: string
        }
        Insert: {
          client_booking_template?: string
          client_cancellation_template?: string
          client_registration_template?: string
          client_reminder_template?: string
          client_reschedule_template?: string
          created_at?: string
          id?: string
          professional_booking_template?: string
          professional_cancellation_template?: string
          professional_reschedule_template?: string
          subscription_notification_time?: string
          subscription_overdue_days_after?: number[]
          subscription_overdue_enabled?: boolean
          subscription_overdue_template?: string
          subscription_payment_confirmation_enabled?: boolean
          subscription_payment_confirmation_template?: string
          subscription_payment_reminder_days_before?: number[]
          subscription_payment_reminder_enabled?: boolean
          subscription_payment_reminder_template?: string
          updated_at?: string
        }
        Update: {
          client_booking_template?: string
          client_cancellation_template?: string
          client_registration_template?: string
          client_reminder_template?: string
          client_reschedule_template?: string
          created_at?: string
          id?: string
          professional_booking_template?: string
          professional_cancellation_template?: string
          professional_reschedule_template?: string
          subscription_notification_time?: string
          subscription_overdue_days_after?: number[]
          subscription_overdue_enabled?: boolean
          subscription_overdue_template?: string
          subscription_payment_confirmation_enabled?: boolean
          subscription_payment_confirmation_template?: string
          subscription_payment_reminder_days_before?: number[]
          subscription_payment_reminder_enabled?: boolean
          subscription_payment_reminder_template?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_message_queue: {
        Row: {
          appointment_id: string | null
          attempts: number
          created_at: string
          event_type: string
          id: string
          idempotency_key: string
          last_error: string | null
          locked_at: string | null
          max_attempts: number
          payload: Json
          platform_billing_charge_id: string | null
          platform_billing_contract_id: string | null
          provider_message_id: string | null
          recipient_kind: string
          recipient_name: string | null
          recipient_phone: string
          rendered_message: string | null
          scheduled_for: string
          sent_at: string | null
          session_id: string
          status: string
          subscription_charge_id: string | null
          template: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          attempts?: number
          created_at?: string
          event_type: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          locked_at?: string | null
          max_attempts?: number
          payload?: Json
          platform_billing_charge_id?: string | null
          platform_billing_contract_id?: string | null
          provider_message_id?: string | null
          recipient_kind: string
          recipient_name?: string | null
          recipient_phone: string
          rendered_message?: string | null
          scheduled_for?: string
          sent_at?: string | null
          session_id: string
          status?: string
          subscription_charge_id?: string | null
          template: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          attempts?: number
          created_at?: string
          event_type?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          locked_at?: string | null
          max_attempts?: number
          payload?: Json
          platform_billing_charge_id?: string | null
          platform_billing_contract_id?: string | null
          provider_message_id?: string | null
          recipient_kind?: string
          recipient_name?: string | null
          recipient_phone?: string
          rendered_message?: string | null
          scheduled_for?: string
          sent_at?: string | null
          session_id?: string
          status?: string
          subscription_charge_id?: string | null
          template?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_message_queue_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_message_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_queue_platform_billing_charge_fk"
            columns: ["platform_billing_charge_id"]
            isOneToOne: false
            referencedRelation: "platform_billing_charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_queue_platform_billing_contract_fk"
            columns: ["platform_billing_contract_id"]
            isOneToOne: false
            referencedRelation: "platform_billing_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_queue_subscription_charge_tenant_fk"
            columns: ["subscription_charge_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "subscription_charges"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_platform_billing_charge_state: {
        Args: {
          p_bank_slip_url?: string
          p_charge_id: string
          p_event_row_id?: string
          p_event_type: string
          p_invoice_url?: string
          p_provider_event_at?: string
          p_provider_event_id: string
          p_provider_payment_id?: string
          p_source?: string
        }
        Returns: Json
      }
      apply_platform_billing_suspensions: {
        Args: { p_as_of?: string }
        Returns: number
      }
      begin_platform_billing_provider_operation: {
        Args: {
          p_charge_id: string
          p_contract_id: string
          p_environment: string
          p_operation_key: string
          p_operation_type: string
          p_request_fingerprint: string
          p_request_payload: Json
          p_tenant_id: string
        }
        Returns: Json
      }
      cancel_payable: {
        Args: { p_movement_id: string; p_reason: string; p_tenant_id: string }
        Returns: Json
      }
      claim_platform_billing_webhook_events: {
        Args: { p_environment: string; p_limit?: number; p_worker_id?: string }
        Returns: Json
      }
      complete_platform_billing_provider_operation: {
        Args: {
          p_error: string
          p_operation_id: string
          p_provider_resource_id: string
          p_response_payload: Json
          p_status: string
        }
        Returns: Json
      }
      consume_booking_customer_rate_limit: {
        Args: {
          p_block_seconds: number
          p_fingerprint_hash: string
          p_limit: number
          p_scope: string
          p_tenant_id: string
          p_window_seconds: number
        }
        Returns: boolean
      }
      create_customer_booking_activation_code: {
        Args: { p_client_id: string; p_tenant_id: string }
        Returns: string
      }
      create_payable_series: {
        Args: {
          p_account_id: string
          p_amount: number
          p_category_id: string
          p_competence_date: string
          p_description: string
          p_document_number: string
          p_first_due_date: string
          p_interval_months: number
          p_notes: string
          p_occurrences: number
          p_payment_method: string
          p_supplier_name: string
          p_tenant_id: string
        }
        Returns: Json
      }
      enqueue_due_platform_billing_whatsapp: { Args: never; Returns: Json }
      enqueue_due_subscription_whatsapp: { Args: never; Returns: Json }
      fail_platform_billing_webhook_event: {
        Args: {
          p_error: string
          p_event_row_id: string
          p_retry_after_seconds?: number
        }
        Returns: Json
      }
      finalize_commanda: {
        Args: {
          p_addition: number
          p_amount_received: number
          p_change_amount: number
          p_commanda_id: string
          p_discount: number
          p_notes: string
          p_payments: Json
          p_subtotal: number
          p_tenant_id: string
          p_total: number
        }
        Returns: Json
      }
      finalize_commanda_with_subscription: {
        Args: {
          p_addition: number
          p_amount_received: number
          p_change_amount: number
          p_commanda_id: string
          p_discount: number
          p_notes: string
          p_payments: Json
          p_subscription_id: string
          p_subtotal: number
          p_tenant_id: string
          p_total: number
        }
        Returns: Json
      }
      generate_commissions_for_commanda: {
        Args: { p_commanda_id: string; p_tenant_id: string }
        Returns: number
      }
      get_platform_billing_worker_health: { Args: never; Returns: Json }
      ingest_platform_billing_webhook_event: {
        Args: {
          p_environment: string
          p_event_id: string
          p_event_type: string
          p_external_reference: string
          p_payload: Json
          p_payment_id: string
          p_provider_created_at: string
        }
        Returns: Json
      }
      process_platform_billing_webhook_event: {
        Args: { p_event_row_id: string }
        Returns: Json
      }
      record_booking_customer_login_failure: {
        Args: { p_cpf_hash: string; p_tenant_id: string }
        Returns: string
      }
      record_booking_customer_login_success: {
        Args: { p_account_id: string; p_tenant_id: string }
        Returns: boolean
      }
      register_booking_customer: {
        Args: {
          p_activation_code?: string
          p_cpf: string
          p_cpf_hash: string
          p_full_name: string
          p_password_hash: string
          p_tenant_id: string
          p_whatsapp: string
          p_whatsapp_consent?: boolean
        }
        Returns: {
          account_id: string
          client_id: string
          cpf: string
          full_name: string
          whatsapp: string
        }[]
      }
      register_subscription_usage: {
        Args: {
          p_appointment_id?: string
          p_benefit_id?: string
          p_commanda_id?: string
          p_commanda_item_id?: string
          p_notes?: string
          p_professional_id?: string
          p_quantity?: number
          p_service_id?: string
          p_source?: string
          p_subscription_id: string
          p_used_at?: string
        }
        Returns: Json
      }
      resolve_commission_rule: {
        Args: {
          p_item_kind: string
          p_professional_id: string
          p_reference_id: string
          p_tenant_id: string
        }
        Returns: {
          percentage: number
          rule_description: string
          rule_id: string
          rule_scope: string
        }[]
      }
      reverse_commission_settlement: {
        Args: { p_reason: string; p_settlement_id: string; p_tenant_id: string }
        Returns: Json
      }
      settle_commissions: {
        Args: {
          p_account_id: string
          p_adjustments: Json
          p_commission_ids: string[]
          p_notes: string
          p_payment_date: string
          p_payment_method: string
          p_period_end: string
          p_period_start: string
          p_professional_id: string
          p_proof_url: string
          p_tenant_id: string
        }
        Returns: Json
      }
      settle_payable: {
        Args: {
          p_account_id: string
          p_movement_id: string
          p_notes: string
          p_payment_date: string
          p_payment_method: string
          p_proof_url: string
          p_tenant_id: string
        }
        Returns: Json
      }
      update_payable: {
        Args: {
          p_account_id: string
          p_amount: number
          p_category_id: string
          p_competence_date: string
          p_description: string
          p_document_number: string
          p_due_date: string
          p_movement_id: string
          p_notes: string
          p_payment_method: string
          p_supplier_name: string
          p_tenant_id: string
        }
        Returns: Json
      }
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
