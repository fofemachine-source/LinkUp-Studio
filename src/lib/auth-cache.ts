import type { QueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const authUserQueryKey = ["auth-user"] as const;
export const authUserStaleTime = 5 * 60 * 1000;

export async function fetchAuthUser(): Promise<User | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    return data.user;
  } catch (err) {
    return null;
  }
}

export function getAuthUser(queryClient: QueryClient) {
  return queryClient.fetchQuery({
    queryKey: authUserQueryKey,
    queryFn: fetchAuthUser,
    staleTime: authUserStaleTime,
  });
}
