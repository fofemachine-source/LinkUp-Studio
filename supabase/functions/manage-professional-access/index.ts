import {
  createClient,
  type SupabaseClient,
  type User,
} from "https://esm.sh/@supabase/supabase-js@2.110.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AccessRequest = {
  tenantId?: string;
  professionalId?: string;
  fullName?: string;
  email?: string;
  password?: string;
  enabled?: boolean;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function accessErrorMessage(error: { code?: string; message?: string }) {
  const message = error.message ?? "";
  if (
    error.code === "weak_password" ||
    /weak password|weak and easy to guess|known to be weak/i.test(message)
  ) {
    return "A proteção contra senhas vazadas está ativa no Auth. Desative Password HIBP Check para aceitar esta senha.";
  }
  return message || "Não foi possível atualizar o acesso do profissional.";
}

function environmentKey(jsonName: string, legacyNames: string[]): string | undefined {
  const keySet = Deno.env.get(jsonName);
  if (keySet) {
    try {
      const parsed = JSON.parse(keySet) as Record<string, string>;
      if (parsed.default) return parsed.default;
      const first = Object.values(parsed).find(Boolean);
      if (first) return first;
    } catch {
      // Continua para as variáveis legadas quando o conteúdo não é JSON.
    }
  }

  for (const name of legacyNames) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  return undefined;
}

async function findUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  const perPage = 200;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const match = data.users.find((user: User) => user.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
  return null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "Método não permitido." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publishableKey = environmentKey("SUPABASE_PUBLISHABLE_KEYS", [
      "SUPABASE_ANON_KEY",
      "SUPABASE_PUBLISHABLE_KEY",
    ]);
    const serviceRoleKey = environmentKey("SUPABASE_SECRET_KEYS", [
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_SECRET_KEY",
    ]);
    if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
      return json(
        {
          error: "O backend do Lovable Cloud não está conectado corretamente.",
        },
        500,
      );
    }

    const authorization = request.headers.get("Authorization");
    const token = authorization?.replace(/^Bearer\s+/i, "");
    if (!authorization || !token) {
      return json({ error: "Sessão não encontrada." }, 401);
    }

    const callerClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: caller, error: callerError } = await callerClient.auth.getUser(token);
    if (callerError || !caller.user) {
      return json({ error: "Sessão inválida ou expirada." }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const body = (await request.json()) as AccessRequest;
    const tenantId = body.tenantId?.trim();
    const professionalId = body.professionalId?.trim();
    const enabled = body.enabled !== false;
    if (!tenantId || !professionalId) {
      return json({ error: "Empresa ou profissional não informado." }, 400);
    }

    const { data: callerRoles, error: rolesError } = await admin
      .from("user_roles")
      .select("role, tenant_id")
      .eq("user_id", caller.user.id);
    if (rolesError) throw rolesError;

    const canManage = (callerRoles ?? []).some(
      (role) =>
        role.role === "super_admin" ||
        (role.tenant_id === tenantId && (role.role === "owner" || role.role === "staff")),
    );
    if (!canManage) {
      return json({ error: "Você não tem permissão para alterar este acesso." }, 403);
    }

    const { data: professional, error: professionalError } = await admin
      .from("professionals")
      .select("id, tenant_id, auth_user_id, email, full_name")
      .eq("id", professionalId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (professionalError) throw professionalError;
    if (!professional) {
      return json({ error: "Profissional não encontrado." }, 404);
    }

    if (!enabled) {
      if (professional.auth_user_id) {
        const { error: roleDeleteError } = await admin
          .from("user_roles")
          .delete()
          .eq("user_id", professional.auth_user_id)
          .eq("tenant_id", tenantId)
          .eq("role", "barber");
        if (roleDeleteError) throw roleDeleteError;
      }

      const { error: unlinkError } = await admin
        .from("professionals")
        .update({ auth_user_id: null })
        .eq("id", professionalId)
        .eq("tenant_id", tenantId);
      if (unlinkError) throw unlinkError;

      return json({ ok: true, enabled: false, userId: null });
    }

    const email = body.email?.toLowerCase().trim();
    const fullName = body.fullName?.trim() || professional.full_name;
    const password = body.password || undefined;
    if (!email) {
      return json({ error: "Informe o e-mail para liberar o acesso." }, 400);
    }
    if (!professional.auth_user_id && (!password || password.length < 8)) {
      return json({ error: "A senha precisa ter no mínimo 8 caracteres." }, 400);
    }

    let authUser: User | null = null;
    if (professional.auth_user_id) {
      const existing = await admin.auth.admin.getUserById(professional.auth_user_id);
      if (!existing.error) authUser = existing.data.user;
    }
    if (!authUser) {
      authUser = await findUserByEmail(admin, email);
    }

    if (!authUser) {
      const created = await admin.auth.admin.createUser({
        email,
        password: password!,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (created.error) {
        return json({ error: accessErrorMessage(created.error) }, 400);
      }
      authUser = created.data.user;
    } else {
      const attributes: Record<string, unknown> = {
        user_metadata: { ...authUser.user_metadata, full_name: fullName },
      };
      if (authUser.email?.toLowerCase() !== email) {
        attributes.email = email;
        attributes.email_confirm = true;
      }
      if (password) attributes.password = password;

      const updated = await admin.auth.admin.updateUserById(authUser.id, attributes);
      if (updated.error) {
        return json({ error: accessErrorMessage(updated.error) }, 400);
      }
      authUser = updated.data.user;
    }

    const { error: roleError } = await admin
      .from("user_roles")
      .upsert(
        { user_id: authUser.id, tenant_id: tenantId, role: "barber" },
        { onConflict: "user_id,tenant_id,role", ignoreDuplicates: true },
      );
    if (roleError) throw roleError;

    const { error: profileError } = await admin
      .from("profiles")
      .upsert(
        { id: authUser.id, full_name: fullName, active_tenant_id: tenantId },
        { onConflict: "id" },
      );
    if (profileError) throw profileError;

    const { error: linkError } = await admin
      .from("professionals")
      .update({ auth_user_id: authUser.id, email })
      .eq("id", professionalId)
      .eq("tenant_id", tenantId);
    if (linkError) throw linkError;

    return json({ ok: true, enabled: true, userId: authUser.id });
  } catch (error) {
    console.error("[manage-professional-access]", error);
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível atualizar o acesso do profissional.",
      },
      500,
    );
  }
});
