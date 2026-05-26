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
      albums: {
        Row: {
          album_type: string | null
          audio_features: Json | null
          cover_url: string | null
          duration_ms: number | null
          id: string
          is_prewarm_seed: boolean
          lastfm_listeners: number | null
          lastfm_playcount: number | null
          lastfm_url: string | null
          mb_release_group_id: string | null
          metadata_updated_at: string
          primary_artist_name: string
          primary_artist_spotify_id: string | null
          release_year: number | null
          spotify_id: string
          title: string
          total_tracks: number | null
        }
        Insert: {
          album_type?: string | null
          audio_features?: Json | null
          cover_url?: string | null
          duration_ms?: number | null
          id?: string
          is_prewarm_seed?: boolean
          lastfm_listeners?: number | null
          lastfm_playcount?: number | null
          lastfm_url?: string | null
          mb_release_group_id?: string | null
          metadata_updated_at?: string
          primary_artist_name: string
          primary_artist_spotify_id?: string | null
          release_year?: number | null
          spotify_id: string
          title: string
          total_tracks?: number | null
        }
        Update: {
          album_type?: string | null
          audio_features?: Json | null
          cover_url?: string | null
          duration_ms?: number | null
          id?: string
          is_prewarm_seed?: boolean
          lastfm_listeners?: number | null
          lastfm_playcount?: number | null
          lastfm_url?: string | null
          mb_release_group_id?: string | null
          metadata_updated_at?: string
          primary_artist_name?: string
          primary_artist_spotify_id?: string | null
          release_year?: number | null
          spotify_id?: string
          title?: string
          total_tracks?: number | null
        }
        Relationships: []
      }
      albums_of_the_day: {
        Row: {
          album_id: string
          algorithm_version: number
          created_at: string
          date: string
          fallback_reason: string | null
          id: string
          is_fallback: boolean
          opened_at: string | null
          selection_reason: Json
          status: string
          user_id: string
          user_timezone_at_compute: string | null
        }
        Insert: {
          album_id: string
          algorithm_version?: number
          created_at?: string
          date: string
          fallback_reason?: string | null
          id?: string
          is_fallback?: boolean
          opened_at?: string | null
          selection_reason: Json
          status?: string
          user_id: string
          user_timezone_at_compute?: string | null
        }
        Update: {
          album_id?: string
          algorithm_version?: number
          created_at?: string
          date?: string
          fallback_reason?: string | null
          id?: string
          is_fallback?: boolean
          opened_at?: string | null
          selection_reason?: Json
          status?: string
          user_id?: string
          user_timezone_at_compute?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "albums_of_the_day_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_similarity_cache: {
        Row: {
          fetched_at: string
          id: string
          similar_artists: Json
          source: string
          source_artist_key: string
          source_artist_name: string
        }
        Insert: {
          fetched_at?: string
          id?: string
          similar_artists: Json
          source: string
          source_artist_key: string
          source_artist_name: string
        }
        Update: {
          fetched_at?: string
          id?: string
          similar_artists?: Json
          source?: string
          source_artist_key?: string
          source_artist_name?: string
        }
        Relationships: []
      }
      audio_features_cache: {
        Row: {
          features: Json
          fetched_at: string
          spotify_track_id: string
        }
        Insert: {
          features: Json
          fetched_at?: string
          spotify_track_id: string
        }
        Update: {
          features?: Json
          fetched_at?: string
          spotify_track_id?: string
        }
        Relationships: []
      }
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
      musicbrainz_release_group_cache: {
        Row: {
          fetched_at: string
          first_release_date: string | null
          id: string
          normalized_album: string
          normalized_artist: string
          primary_type: string | null
          release_group_id: string | null
          secondary_types: string[]
        }
        Insert: {
          fetched_at?: string
          first_release_date?: string | null
          id?: string
          normalized_album: string
          normalized_artist: string
          primary_type?: string | null
          release_group_id?: string | null
          secondary_types?: string[]
        }
        Update: {
          fetched_at?: string
          first_release_date?: string | null
          id?: string
          normalized_album?: string
          normalized_artist?: string
          primary_type?: string | null
          release_group_id?: string | null
          secondary_types?: string[]
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
      ratings: {
        Row: {
          album_id: string
          album_of_the_day_id: string | null
          comment: string | null
          created_at: string
          id: string
          is_public: boolean
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          album_id: string
          album_of_the_day_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          score: number
          updated_at?: string
          user_id: string
        }
        Update: {
          album_id?: string
          album_of_the_day_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_album_of_the_day_id_fkey"
            columns: ["album_of_the_day_id"]
            isOneToOne: false
            referencedRelation: "albums_of_the_day"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_history: {
        Row: {
          album_id: string
          id: string
          recommended_at: string
          user_id: string
        }
        Insert: {
          album_id: string
          id?: string
          recommended_at?: string
          user_id: string
        }
        Update: {
          album_id?: string
          id?: string
          recommended_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_history_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
        ]
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
          spotify_product: string | null
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
          spotify_product?: string | null
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
          spotify_product?: string | null
          token_expires_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_library: {
        Row: {
          added_at_provider: string | null
          album_name: string
          artist_ids: Json | null
          artist_name: string
          cover_url: string | null
          id: string
          mb_release_group_id: string | null
          primary_artist_spotify_id: string | null
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
          artist_ids?: Json | null
          artist_name: string
          cover_url?: string | null
          id?: string
          mb_release_group_id?: string | null
          primary_artist_spotify_id?: string | null
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
          artist_ids?: Json | null
          artist_name?: string
          cover_url?: string | null
          id?: string
          mb_release_group_id?: string | null
          primary_artist_spotify_id?: string | null
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
          spotify_product: string | null
          user_id: string | null
        }
        Insert: {
          connected_at?: string | null
          id?: string | null
          last_synced_at?: string | null
          provider?: string | null
          provider_user_id?: string | null
          scopes?: string[] | null
          spotify_product?: string | null
          user_id?: string | null
        }
        Update: {
          connected_at?: string | null
          id?: string | null
          last_synced_at?: string | null
          provider?: string | null
          provider_user_id?: string | null
          scopes?: string[] | null
          spotify_product?: string | null
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
      discovery_album_rows: {
        Args: { p_user_id: string }
        Returns: {
          album_cover_url: string
          album_duration_ms: number
          album_id: string
          album_primary_artist_name: string
          album_release_year: number
          album_spotify_id: string
          album_title: string
          album_total_tracks: number
          aotd_id: string
          fallback_reason: string
          is_fallback: boolean
          opened_at: string
          pick_date: string
          rating_comment: string
          rating_created_at: string
          rating_id: string
          rating_score: number
          rating_updated_at: string
          selection_reason: Json
          status: string
        }[]
      }
      ensure_recommendation_atomic: {
        Args: {
          p_album_id: string
          p_algorithm_version: number
          p_date: string
          p_fallback_reason: string
          p_is_fallback: boolean
          p_selection_reason: Json
          p_user_id: string
          p_user_timezone: string
        }
        Returns: {
          aotd_id: string
          created: boolean
        }[]
      }
      find_users_due_for_compute: {
        Args: { p_lead_minutes?: number }
        Returns: {
          push_time: string
          target_date: string
          user_id: string
          user_tz: string
        }[]
      }
      get_current_pick: {
        Args: { p_user_id: string }
        Returns: {
          album_cover_url: string
          album_duration_ms: number
          album_id: string
          album_primary_artist_name: string
          album_release_year: number
          album_spotify_id: string
          album_title: string
          album_total_tracks: number
          aotd_id: string
          fallback_reason: string
          is_fallback: boolean
          opened_at: string
          pick_date: string
          rating_comment: string
          rating_created_at: string
          rating_id: string
          rating_score: number
          rating_updated_at: string
          selection_reason: Json
          status: string
        }[]
      }
      get_discoveries: {
        Args: { p_user_id: string }
        Returns: {
          album_cover_url: string
          album_duration_ms: number
          album_id: string
          album_primary_artist_name: string
          album_release_year: number
          album_spotify_id: string
          album_title: string
          album_total_tracks: number
          aotd_id: string
          fallback_reason: string
          is_fallback: boolean
          opened_at: string
          pick_date: string
          rating_comment: string
          rating_created_at: string
          rating_id: string
          rating_score: number
          rating_updated_at: string
          selection_reason: Json
          status: string
        }[]
      }
      get_discovery_detail: {
        Args: { p_aotd_id: string; p_user_id: string }
        Returns: {
          album_cover_url: string
          album_duration_ms: number
          album_id: string
          album_primary_artist_name: string
          album_release_year: number
          album_spotify_id: string
          album_title: string
          album_total_tracks: number
          aotd_id: string
          fallback_reason: string
          is_fallback: boolean
          opened_at: string
          pick_date: string
          rating_comment: string
          rating_created_at: string
          rating_id: string
          rating_score: number
          rating_updated_at: string
          selection_reason: Json
          status: string
        }[]
      }
      resolve_user_compute_context: {
        Args: { p_user_id: string }
        Returns: {
          push_time: string
          target_date: string
          user_tz: string
        }[]
      }
      save_album_rating: {
        Args: {
          p_aotd_id: string
          p_comment?: string
          p_score: number
          p_user_id: string
        }
        Returns: {
          album_id: string
          album_of_the_day_id: string
          comment: string
          created_at: string
          id: string
          is_public: boolean
          score: number
          updated_at: string
          user_id: string
        }[]
      }
      try_start_library_sync: {
        Args: {
          p_stale_after?: string
          p_started_at: string
          p_user_id: string
        }
        Returns: {
          aggregated_albums_count: number
          should_start: boolean
          started_at: string
          status: string
          updated_at: string
        }[]
      }
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
