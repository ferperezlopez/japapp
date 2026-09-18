// Tipos de la base de datos, escritos a mano para reflejar
// supabase/migrations/0001_init.sql. Una vez creado el proyecto de Supabase,
// se pueden regenerar automáticamente con:
//   npx supabase gen types typescript --project-id <id> > src/lib/supabase/database.types.ts

export interface Database {
  public: {
    Views: Record<string, never>;
    Functions: {
      find_similar_profile_names: {
        Args: { candidate_name: string };
        Returns: { name: string }[];
      };
      get_push_subscriptions_for_users: {
        Args: { p_user_ids: string[] };
        Returns: { user_id: string; endpoint: string; p256dh: string; auth: string }[];
      };
      prune_push_subscription: {
        Args: { p_endpoint: string };
        Returns: void;
      };
    };
    Tables: {
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          endpoint?: string;
          p256dh?: string;
          auth?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          avatar_url: string | null;
          created_at: string;
          alias: string | null;
          is_admin: boolean;
        };
        Insert: {
          id: string;
          email: string;
          name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          alias?: string | null;
          is_admin?: boolean;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          alias?: string | null;
          is_admin?: boolean;
        };
        Relationships: [];
      };
      groups: {
        Row: {
          id: string;
          name: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "groups_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      group_members: {
        Row: {
          group_id: string;
          user_id: string;
          joined_at: string;
        };
        Insert: {
          group_id: string;
          user_id: string;
          joined_at?: string;
        };
        Update: {
          group_id?: string;
          user_id?: string;
          joined_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          id: string;
          group_id: string;
          description: string;
          item_id: string | null;
          amount: number;
          paid_by: string;
          expense_date: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          description: string;
          item_id?: string | null;
          amount: number;
          paid_by: string;
          expense_date?: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          description?: string;
          item_id?: string | null;
          amount?: number;
          paid_by?: string;
          expense_date?: string;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_paid_by_fkey";
            columns: ["paid_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "insumo_items";
            referencedColumns: ["id"];
          },
        ];
      };
      expense_shares: {
        Row: {
          expense_id: string;
          user_id: string;
          share_amount: number;
        };
        Insert: {
          expense_id: string;
          user_id: string;
          share_amount: number;
        };
        Update: {
          expense_id?: string;
          user_id?: string;
          share_amount?: number;
        };
        Relationships: [
          {
            foreignKeyName: "expense_shares_expense_id_fkey";
            columns: ["expense_id"];
            isOneToOne: false;
            referencedRelation: "expenses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expense_shares_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          id: string;
          name: string;
          event_date: string;
          location: string | null;
          description: string | null;
          group_id: string | null;
          created_by: string;
          created_at: string;
          has_futbol: boolean;
        };
        Insert: {
          id?: string;
          name: string;
          event_date: string;
          location?: string | null;
          description?: string | null;
          group_id?: string | null;
          created_by: string;
          created_at?: string;
          has_futbol?: boolean;
        };
        Update: {
          id?: string;
          name?: string;
          event_date?: string;
          location?: string | null;
          description?: string | null;
          group_id?: string | null;
          created_by?: string;
          created_at?: string;
          has_futbol?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "events_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      event_rsvps: {
        Row: {
          event_id: string;
          user_id: string;
          status: "yes" | "no" | "maybe";
          responded_at: string;
          kind: "juntada" | "futbol";
        };
        Insert: {
          event_id: string;
          user_id: string;
          status: "yes" | "no" | "maybe";
          responded_at?: string;
          kind?: "juntada" | "futbol";
        };
        Update: {
          event_id?: string;
          user_id?: string;
          status?: "yes" | "no" | "maybe";
          responded_at?: string;
          kind?: "juntada" | "futbol";
        };
        Relationships: [
          {
            foreignKeyName: "event_rsvps_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_rsvps_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      venues: {
        Row: {
          id: string;
          name: string;
          created_by: string;
          created_at: string;
          host_user_id: string | null;
          address: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          created_by: string;
          created_at?: string;
          host_user_id?: string | null;
          address?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          created_by?: string;
          created_at?: string;
          host_user_id?: string | null;
          address?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "venues_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "venues_host_user_id_fkey";
            columns: ["host_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      guests: {
        Row: {
          id: string;
          name: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "guests_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      event_guests: {
        Row: {
          id: string;
          event_id: string;
          guest_id: string;
          kind: "juntada" | "futbol";
          added_by: string;
          brought_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          guest_id: string;
          kind?: "juntada" | "futbol";
          added_by: string;
          brought_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          guest_id?: string;
          kind?: "juntada" | "futbol";
          added_by?: string;
          brought_by?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_guests_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_guests_guest_id_fkey";
            columns: ["guest_id"];
            isOneToOne: false;
            referencedRelation: "guests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_guests_added_by_fkey";
            columns: ["added_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_guests_brought_by_fkey";
            columns: ["brought_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      insumo_items: {
        Row: {
          id: string;
          name: string;
          icon: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          icon?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          icon?: string | null;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "insumo_items_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      event_tasks: {
        Row: {
          id: string;
          event_id: string;
          task_type:
            | "compra_insumos"
            | "lavado_platos"
            | "orden_sede"
            | "reserva_cancha";
          assigned_to: string;
          item_id: string | null;
          updated_by: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          task_type:
            | "compra_insumos"
            | "lavado_platos"
            | "orden_sede"
            | "reserva_cancha";
          assigned_to: string;
          item_id?: string | null;
          updated_by: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          task_type?:
            | "compra_insumos"
            | "lavado_platos"
            | "orden_sede"
            | "reserva_cancha";
          assigned_to?: string;
          item_id?: string | null;
          updated_by?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_tasks_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_tasks_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_tasks_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "insumo_items";
            referencedColumns: ["id"];
          },
        ];
      };
      futbol_stats: {
        Row: {
          event_id: string;
          resultado: string | null;
          mvp_user_id: string | null;
          goleador_user_id: string | null;
          updated_by: string;
          updated_at: string;
        };
        Insert: {
          event_id: string;
          resultado?: string | null;
          mvp_user_id?: string | null;
          goleador_user_id?: string | null;
          updated_by: string;
          updated_at?: string;
        };
        Update: {
          event_id?: string;
          resultado?: string | null;
          mvp_user_id?: string | null;
          goleador_user_id?: string | null;
          updated_by?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "futbol_stats_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: true;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "futbol_stats_mvp_user_id_fkey";
            columns: ["mvp_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "futbol_stats_goleador_user_id_fkey";
            columns: ["goleador_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "futbol_stats_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      futbol_teams: {
        Row: {
          id: string;
          event_id: string;
          user_id: string | null;
          event_guest_id: string | null;
          team: number;
          position: "gk" | "def" | "fwd";
          updated_by: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          user_id?: string | null;
          event_guest_id?: string | null;
          team: number;
          position?: "gk" | "def" | "fwd";
          updated_by: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          user_id?: string | null;
          event_guest_id?: string | null;
          team?: number;
          position?: "gk" | "def" | "fwd";
          updated_by?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "futbol_teams_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "futbol_teams_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "futbol_teams_event_guest_id_fkey";
            columns: ["event_guest_id"];
            isOneToOne: false;
            referencedRelation: "event_guests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "futbol_teams_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      event_media: {
        Row: {
          id: string;
          event_id: string;
          uploaded_by: string;
          storage_path: string;
          created_at: string;
          legacy: boolean;
        };
        Insert: {
          id?: string;
          event_id: string;
          uploaded_by: string;
          storage_path: string;
          created_at?: string;
          legacy?: boolean;
        };
        Update: {
          id?: string;
          event_id?: string;
          uploaded_by?: string;
          storage_path?: string;
          created_at?: string;
          legacy?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "event_media_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_media_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
  };
}
