/** Sign-in messages shared by the login route and the login page (no server-only imports). */
export type LoginErrorCode =
  | "invalid"
  | "rate_limited"
  | "revoked"
  | "device_limit"
  | "not_activated"
  | "activation_invalid"
  | "unavailable"
  | "bad";

export const LOGIN_MESSAGES: Record<LoginErrorCode, string> = {
  invalid: "Napačno uporabniško ime ali geslo.",
  rate_limited: "Preveč poskusov prijave. Poskusite znova čez nekaj minut.",
  revoked: "Dostop do tega računa ni na voljo. Za pomoč se obrnite na skrbnika.",
  device_limit: "Ta račun je že aktiviran v drugem brskalniku ali napravi. Za ponastavitev dostopa se obrnite na skrbnika.",
  not_activated: "Račun še ni aktiviran. Odprite osebno aktivacijsko povezavo, ki ste jo prejeli od skrbnika.",
  activation_invalid: "Aktivacijska povezava ni veljavna ali je že bila uporabljena. Za novo povezavo se obrnite na skrbnika.",
  unavailable: "Prijava trenutno ni na voljo. Skrbnik mora dokončati nastavitev.",
  bad: "Prijava ni uspela. Osvežite stran in poskusite znova.",
};

/** ?napaka=<code> values used by the no-JavaScript form fallback ("1" and "omejitev" kept from v1). */
export function messageForQuery(q: string | null): string | null {
  if (!q) return null;
  if (q === "1") return LOGIN_MESSAGES.invalid;
  if (q === "omejitev") return LOGIN_MESSAGES.rate_limited;
  return q in LOGIN_MESSAGES ? LOGIN_MESSAGES[q as LoginErrorCode] : null;
}
