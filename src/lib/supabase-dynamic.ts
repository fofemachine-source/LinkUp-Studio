import { supabase } from "@/integrations/supabase/client";

export type SupabaseErrorLike = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

type SupabaseResult<T> = {
  data: T | null;
  error: SupabaseErrorLike | null;
};

type SupabaseMutationValues = Record<string, unknown> | Record<string, unknown>[];

export type DynamicSupabaseQuery<T> = PromiseLike<SupabaseResult<T>> & {
  select(columns?: string): DynamicSupabaseQuery<T>;
  eq(column: string, value: unknown): DynamicSupabaseQuery<T>;
  in(column: string, values: readonly unknown[]): DynamicSupabaseQuery<T>;
  order(column: string, options?: { ascending?: boolean }): DynamicSupabaseQuery<T>;
  limit(count: number): DynamicSupabaseQuery<T>;
  maybeSingle(): DynamicSupabaseQuery<T extends Array<infer Row> ? Row | null : T | null>;
  update(values: Record<string, unknown>): DynamicSupabaseQuery<T>;
  upsert(
    values: SupabaseMutationValues,
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): PromiseLike<SupabaseResult<T>>;
};

type DynamicSupabaseClient = {
  from<T = unknown>(table: string): DynamicSupabaseQuery<T>;
};

export const dynamicSupabase = supabase as unknown as DynamicSupabaseClient;

export function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}
