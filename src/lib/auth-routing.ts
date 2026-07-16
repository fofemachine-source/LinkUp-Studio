import { supabase } from "@/integrations/supabase/client";

export type AuthenticatedDestination = "/saas" | "/app";

export async function getAuthenticatedDestination(
  userId: string,
): Promise<AuthenticatedDestination> {
  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (error) {
    throw new Error("Não foi possível identificar o perfil de acesso.");
  }

  return roles?.some(({ role }) => role === "super_admin") ? "/saas" : "/app";
}
