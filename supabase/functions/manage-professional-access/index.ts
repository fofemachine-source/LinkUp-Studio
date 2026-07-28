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
  accessProfile?: AccessProfile;
  accessPermissions?: string[];
  mustChangePassword?: boolean;
  receiveOperationalNotifications?: boolean;
};

type AccessProfile = "owner" | "manager" | "professional" | "reception";

const permissionCatalog = new Set([
  "dashboard",
  "own_agenda",
  "agenda_all",
  "commandas",
  "clients",
  "manage_staff",
  "services",
  "products",
  "subscriptions",
  "own_finance",
  "finance_general",
  "commissions",
  "inventory",
  "settings",
  "manage_operations",
  "receive_operational_notifications",
]);

const defaultPermissions: Record<AccessProfile, string[]> = {
  owner: [...permissionCatalog],
  manager: [
    "dashboard",
    "agenda_all",
    "commandas",
    "clients",
    "manage_staff",
    "services",
    "products",
    "subscriptions",
    "finance_general",
    "commissions",
    "inventory",
    "settings",
    "manage_operations",
    "receive_operational_notifications",
  ],
  professional: ["own_agenda", "own_finance"],
  reception: [
    "agenda_all",
    "commandas",
    "clients",
    "receive_operational_notifications",
  ],
};

function normalizePermissions(profile: AccessProfile, requested?: string[]) {
  const permissions = Array.from(
    new Set(
      (requested?.length ? requested : defaultPermissions[profile]).filter(
        (permission) => permissionCatalog.has(permission),
      ),
    ),
  );
  if (profile === "professional") {
    permissions.push("own_agenda", "own_finance");
  }
  return Array.from(new Set(permissions));
}

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

    const isSuperAdmin = (callerRoles ?? []).some(
      (role) => role.role === "super_admin",
    );
    const isTenantOwner = (callerRoles ?? []).some(
      (role) => role.tenant_id === tenantId && role.role === "owner",
    );
    const canManage = isSuperAdmin || isTenantOwner;
    if (!canManage) {
      return json({ error: "Você não tem permissão para alterar este acesso." }, 403);
    }

    const { data: professional, error: professionalError } = await admin
      .from("professionals")
      .select(
        "id, tenant_id, auth_user_id, email, full_name, access_profile, must_change_password",
      )
      .eq("id", professionalId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (professionalError) throw professionalError;
    if (!professional) {
      return json({ error: "Profissional não encontrado." }, 404);
    }

    const requestedProfile = body.accessProfile ?? "professional";
    if (!["owner", "manager", "professional", "reception"].includes(requestedProfile)) {
      return json({ error: "Perfil de acesso inválido." }, 400);
    }
    const isManagingOwnOwnerAccess =
      professional.auth_user_id === caller.user.id && isTenantOwner;
    if (isManagingOwnOwnerAccess && requestedProfile !== "owner") {
      return json(
        {
          error: "O proprietário conectado não pode rebaixar o próprio acesso.",
        },
        400,
      );
    }
    const permissions = normalizePermissions(
      requestedProfile,
      body.accessPermissions,
    );

    if (!enabled) {
      if (isManagingOwnOwnerAccess) {
        return json(
          {
            error: "O proprietário conectado não pode desativar o próprio acesso.",
          },
          400,
        );
      }
      if (professional.auth_user_id) {
        const { error: roleDeleteError } = await admin
          .from("user_roles")
          .delete()
          .eq("user_id", professional.auth_user_id)
          .eq("tenant_id", tenantId)
          .in("role", ["owner", "barber", "staff"]);
        if (roleDeleteError) throw roleDeleteError;
      }

      const { error: unlinkError } = await admin
        .from("professionals")
        .update({
          auth_user_id: null,
          must_change_password: false,
          receive_operational_notifications: false,
        })
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

    let authUser: User | null = null;
    let createdUserId: string | null = null;
    let linkedExisting = false;
    if (professional.auth_user_id) {
      const existing = await admin.auth.admin.getUserById(professional.auth_user_id);
      if (existing.error || !existing.data.user) {
        return json(
          {
            error:
              "O login vinculado não foi encontrado no Auth. Revise o vínculo antes de continuar.",
          },
          409,
        );
      }
      authUser = existing.data.user;
      if (authUser.email?.toLowerCase() !== email) {
        return json(
          {
            error:
              "Este profissional já possui um login vinculado. Use o mesmo e-mail do login atual.",
          },
          409,
        );
      }
      if (password && professional.auth_user_id === caller.user.id) {
        return json(
          {
            error:
              "Use a troca de senha da própria conta para alterar o seu acesso.",
          },
          400,
        );
      }
      linkedExisting = true;
    } else {
      authUser = await findUserByEmail(admin, email);
      linkedExisting = Boolean(authUser);
    }

    if (!authUser) {
      if (!password || password.length < 8) {
        return json(
          {
            error:
              "Não existe login com este e-mail. Informe uma senha provisória com no mínimo 8 caracteres para criar a conta.",
          },
          400,
        );
      }
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (created.error) {
        return json({ error: accessErrorMessage(created.error) }, 400);
      }
      authUser = created.data.user;
      createdUserId = authUser.id;
      linkedExisting = false;
    }

    const { data: conflictingProfessional, error: conflictError } = await admin
      .from("professionals")
      .select("id, full_name")
      .eq("tenant_id", tenantId)
      .eq("auth_user_id", authUser.id)
      .neq("id", professionalId)
      .maybeSingle();
    if (conflictError) {
      if (createdUserId) await admin.auth.admin.deleteUser(createdUserId);
      throw conflictError;
    }
    if (conflictingProfessional) {
      if (createdUserId) await admin.auth.admin.deleteUser(createdUserId);
      return json(
        {
          error: `Este login já está vinculado a ${conflictingProfessional.full_name}.`,
        },
        409,
      );
    }

    const appRole =
      requestedProfile === "owner"
        ? "owner"
        : requestedProfile === "professional"
          ? "barber"
          : "staff";

    const passwordReset = Boolean(password && !createdUserId && professional.auth_user_id);
    const mustChangePassword =
      createdUserId || passwordReset ? true : Boolean(professional.must_change_password);

    try {
      // O vínculo granular é gravado antes do papel legado. Assim, uma falha
      // intermediária não deixa um usuário "staff" sem as restrições novas.
      const { error: linkError } = await admin
        .from("professionals")
        .update({
          auth_user_id: authUser.id,
          email: authUser.email ?? email,
          access_profile: requestedProfile,
          access_permissions: permissions,
          must_change_password: mustChangePassword,
          receive_operational_notifications: Boolean(
            body.receiveOperationalNotifications,
          ),
        })
        .eq("id", professionalId)
        .eq("tenant_id", tenantId);
      if (linkError) throw linkError;

      const { error: oldRolesError } = await admin
        .from("user_roles")
        .delete()
        .eq("user_id", authUser.id)
        .eq("tenant_id", tenantId)
        .in("role", ["owner", "barber", "staff"]);
      if (oldRolesError) throw oldRolesError;

      const { error: roleError } = await admin
        .from("user_roles")
        .upsert(
          { user_id: authUser.id, tenant_id: tenantId, role: appRole },
          { onConflict: "user_id,tenant_id,role", ignoreDuplicates: true },
        );
      if (roleError) throw roleError;

      const { data: existingProfile, error: existingProfileError } = await admin
        .from("profiles")
        .select("id, active_tenant_id")
        .eq("id", authUser.id)
        .maybeSingle();
      if (existingProfileError) throw existingProfileError;

      if (!existingProfile) {
        const { error: profileInsertError } = await admin.from("profiles").insert({
          id: authUser.id,
          full_name: fullName,
          active_tenant_id: tenantId,
        });
        if (profileInsertError) throw profileInsertError;
      } else if (!existingProfile.active_tenant_id) {
        const { error: profileUpdateError } = await admin
          .from("profiles")
          .update({ active_tenant_id: tenantId })
          .eq("id", authUser.id)
          .is("active_tenant_id", null);
        if (profileUpdateError) throw profileUpdateError;
      }

      if (passwordReset) {
        const { error: passwordUpdateError } = await admin.auth.admin.updateUserById(
          authUser.id,
          { password: password! },
        );
        if (passwordUpdateError) {
          await admin
            .from("professionals")
            .update({ must_change_password: Boolean(professional.must_change_password) })
            .eq("id", professionalId)
            .eq("tenant_id", tenantId);
          return json({ error: accessErrorMessage(passwordUpdateError) }, 400);
        }
      }
    } catch (mutationError) {
      if (createdUserId) {
        await admin.auth.admin.deleteUser(createdUserId);
      }
      throw mutationError;
    }

    return json({
      ok: true,
      enabled: true,
      userId: authUser.id,
      created: Boolean(createdUserId),
      linkedExisting,
      passwordReset,
      mustChangePassword,
      accessProfile: requestedProfile,
      accessPermissions: permissions,
    });
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
