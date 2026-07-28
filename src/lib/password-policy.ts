export const PROJECT_PASSWORD_MIN_LENGTH = 8;

export const PROJECT_PASSWORD_REQUIREMENT =
  `A senha precisa ter pelo menos ${PROJECT_PASSWORD_MIN_LENGTH} caracteres.`;

export function validateProjectPassword(password: string) {
  return password.length < PROJECT_PASSWORD_MIN_LENGTH
    ? PROJECT_PASSWORD_REQUIREMENT
    : null;
}

export function projectPasswordAuthErrorMessage(
  error: { code?: string; message?: string } | null | undefined,
  fallback: string,
  options?: { temporaryPassword?: boolean },
) {
  const message = error?.message ?? "";
  if (
    error?.code === "weak_password" ||
    /weak password|weak and easy to guess|known to be weak|password.*guess/i.test(message)
  ) {
    if (options?.temporaryPassword) {
      return "O Supabase recusou esta senha provisória simples porque o Password HIBP Check está ativo no Auth. Para usar senhas provisórias simples, desative essa proteção no Supabase/Lovable e salve novamente.";
    }
    return "O Supabase recusou esta senha pela proteção contra senhas vazadas. Escolha outra senha pessoal ou ajuste o Password HIBP Check no Auth do Supabase/Lovable.";
  }
  return message || fallback;
}
