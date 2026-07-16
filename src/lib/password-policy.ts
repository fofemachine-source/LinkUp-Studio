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
) {
  const message = error?.message ?? "";
  if (
    error?.code === "weak_password" ||
    /weak password|weak and easy to guess|known to be weak|password.*guess/i.test(message)
  ) {
    return "A proteção contra senhas vazadas está ativa no Auth. Desative a opção Password HIBP Check para que a única exigência seja o mínimo de 8 caracteres.";
  }
  return message || fallback;
}
