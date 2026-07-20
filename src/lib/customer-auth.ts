export const CUSTOMER_PASSWORD_MIN_LENGTH = 8;
export const CUSTOMER_PASSWORD_MAX_LENGTH = 128;

export type BookingCustomer = {
  accountId: string;
  clientId: string;
  fullName: string;
  whatsapp: string;
  cpfLast4: string;
};

export function cleanCustomerCpf(value: string) {
  return value.replace(/\D/g, "").slice(0, 11);
}

export function isValidCustomerCpf(value: string) {
  const cpf = cleanCustomerCpf(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const digit = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export function cleanCustomerWhatsapp(value: string) {
  const digits = value.replace(/\D/g, "");
  return [12, 13].includes(digits.length) && digits.startsWith("55")
    ? digits.slice(2)
    : digits.slice(0, 11);
}

export function isValidCustomerWhatsapp(value: string) {
  const whatsapp = cleanCustomerWhatsapp(value);
  return whatsapp.length === 10 || whatsapp.length === 11;
}

export function customerPasswordError(password: string) {
  if (password.length < CUSTOMER_PASSWORD_MIN_LENGTH) {
    return `A senha precisa ter pelo menos ${CUSTOMER_PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (password.length > CUSTOMER_PASSWORD_MAX_LENGTH) {
    return `A senha pode ter no máximo ${CUSTOMER_PASSWORD_MAX_LENGTH} caracteres.`;
  }
  return null;
}
