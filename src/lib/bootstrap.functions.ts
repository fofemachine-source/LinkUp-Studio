import { createServerFn } from "@tanstack/react-start";

const disabledProvisioningMessage =
  "Provisionamento administrativo desativado. Gerencie usuários e permissões pelo console matriz.";

/**
 * Mantido apenas por compatibilidade com versões antigas do cliente.
 *
 * O provisionamento público foi encerrado depois que o login de lojas e da
 * administração matriz foi unificado. Permitir e-mail e senha enviados pelo
 * navegador aqui daria ao chamador acesso para criar ou promover super-admins.
 */
export const bootstrapSuperAdmin = createServerFn({ method: "POST" }).handler(async () => {
  throw new Error(disabledProvisioningMessage);
});

/**
 * O cadastro público de proprietário também permanece bloqueado. Novas lojas e
 * seus usuários devem ser criados somente pelo fluxo autenticado do console SaaS.
 */
export const signUpOwner = createServerFn({ method: "POST" }).handler(async () => {
  throw new Error(disabledProvisioningMessage);
});
