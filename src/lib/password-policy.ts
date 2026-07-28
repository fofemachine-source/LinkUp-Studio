export const PROJECT_PASSWORD_MIN_LENGTH = 8;

export const PROJECT_PASSWORD_REQUIREMENT =
  `Use uma senha com no mínimo ${PROJECT_PASSWORD_MIN_LENGTH} caracteres, incluindo letras e números.`;

export function validateProjectPassword(password: string) {
  return password.length < PROJECT_PASSWORD_MIN_LENGTH ||
    !/[A-Za-z]/.test(password) ||
    !/\d/.test(password)
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
      return "Essa senha provisória foi recusada pela proteção do Auth. Use no mínimo 8 caracteres, com letras e números, e evite combinações muito comuns.";
    }
    return "Essa senha foi recusada pela proteção do Auth. Use no mínimo 8 caracteres, com letras e números, e evite combinações muito comuns.";
  }
  return message || fallback;
}
