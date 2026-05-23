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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      library_sync_status: {
        Row: {
          aggregated_albums_count: number | null
          completed_at: string | null
          error_code: string | null
          error_message: string | null
          processed_count: number
          provider: string
          saved_albums_count: number | null
          saved_tracks_count: number | null
          started_at: string | null
          status: string
          total_estimate: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          aggregated_albums_count?: number | null
          completed_at?: string | null
          error_code?: string | null
          error_message?: string | null
          processed_count?: number
          provider: string
          saved_albums_count?: number | null
          saved_tracks_count?: number | null
          started_at?: string | null
          status: string
          total_estimate?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          aggregated_albums_count?: number | null
          completed_at?: string | null
          error_code?: string | null
          error_message?: string | null
          processed_count?: number
          provider?: string
          saved_albums_count?: number | null
          saved_tracks_count?: number | null
          started_at?: string | null
          status?: string
          total_estimate?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          onboarding_completed: boolean
          preferred_push_time: string
          timezone: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          onboarding_completed?: boolean
          preferred_push_time?: string
          timezone?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          onboarding_completed?: boolean
          preferred_push_time?: string
          timezone?: string
        }
        Relationships: []
      }
      streaming_connections: {
        Row: {
          access_token: string
          connected_at: string
          id: string
          last_synced_at: string | null
          provider: string
          provider_user_id: string
          refresh_token: string
          scopes: string[]
          token_expires_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          connected_at?: string
          id?: string
          last_synced_at?: string | null
          provider: string
          provider_user_id: string
          refresh_token: string
          scopes?: string[]
          token_expires_at: string
          user_id: string
        }
        Update: {
          access_token?: string
          connected_at?: string
          id?: string
          last_synced_at?: string | null
          provider?: string
          provider_user_id?: string
          refresh_token?: string
          scopes?: string[]
          token_expires_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_library: {
        Row: {
          added_at_provider: string | null
          album_name: string
          artist_name: string
          cover_url: string | null
          id: string
          mb_release_group_id: string | null
          provider: string
          provider_album_id: string
          release_year: number | null
          removed_at: string | null
          source: Json
          synced_at: string
          total_tracks: number | null
          user_id: string
        }
        Insert: {
          added_at_provider?: string | null
          album_name: string
          artist_name: string
          cover_url?: string | null
          id?: string
          mb_release_group_id?: string | null
          provider: string
          provider_album_id: string
          release_year?: number | null
          removed_at?: string | null
          source?: Json
          synced_at?: string
          total_tracks?: number | null
          user_id: string
        }
        Update: {
          added_at_provider?: string | null
          album_name?: string
          artist_name?: string
          cover_url?: string | null
          id?: string
          mb_release_group_id?: string | null
          provider?: string
          provider_album_id?: string
          release_year?: number | null
          removed_at?: string | null
          source?: Json
          synced_at?: string
          total_tracks?: number | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      streaming_connections_safe: {
        Row: {
          connected_at: string | null
          id: string | null
          last_synced_at: string | null
          provider: string | null
          provider_user_id: string | null
          scopes: string[] | null
          user_id: string | null
        }
        Insert: {
          connected_at?: string | null
          id?: string | null
          last_synced_at?: string | null
          provider?: string | null
          provider_user_id?: string | null
          scopes?: string[] | null
          user_id?: string | null
        }
        Update: {
          connected_at?: string | null
          id?: string | null
          last_synced_at?: string | null
          provider?: string | null
          provider_user_id?: string | null
          scopes?: string[] | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_library_active: {
        Row: {
          added_at_provider: string | null
          album_name: string | null
          artist_name: string | null
          cover_url: string | null
          id: string | null
          mb_release_group_id: string | null
          provider: string | null
          provider_album_id: string | null
          release_year: number | null
          source: Json | null
          synced_at: string | null
          total_tracks: number | null
          user_id: string | null
        }
        Insert: {
          added_at_provider?: string | null
          album_name?: string | null
          artist_name?: string | null
          cover_url?: string | null
          id?: string | null
          mb_release_group_id?: string | null
          provider?: string | null
          provider_album_id?: string | null
          release_year?: number | null
          source?: Json | null
          synced_at?: string | null
          total_tracks?: number | null
          user_id?: string | null
        }
        Update: {
          added_at_provider?: string | null
          album_name?: string | null
          artist_name?: string | null
          cover_url?: string | null
          id?: string | null
          mb_release_group_id?: string | null
          provider?: string | null
          provider_album_id?: string | null
          release_year?: number | null
          source?: Json | null
          synced_at?: string | null
          total_tracks?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
