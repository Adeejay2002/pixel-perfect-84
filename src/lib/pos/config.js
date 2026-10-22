export const APP_NAME = "Jnex POS system";
export const BRAND_FOOTER = "Powered by Jnex";

export const DEFAULT_OWNER_PASSCODE = "8888";
export const DEFAULT_CASHIER_PASSCODE = "0000";
// legacy (pre-roles) client passcode, migrated into the owner passcode
export const DEFAULT_CLIENT_PASSCODE = "1234";

export const MAX_ATTEMPTS = 5;
export const LOCKOUT_SECONDS = 30;

export const STORAGE_KEY = "aronium_pos_state_v1";

export const ROLE_LABEL = { owner: "Owner", cashier: "Cashier" };
export const canSeeCost = (role) => role === "owner";

// Simple non-plaintext digest (mock phase only, swap for bcrypt/server auth later)
export function hashCode(value) {
  let h = 5381;
  const s = String(value) + "::aronium-salt";
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return "h" + h.toString(16);
}
