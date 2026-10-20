// ---------------------------------------------------------------------------
// DEVELOPER CONFIG — Super Admin passcode default. Unlike owner/cashier
// codes this one isn't plaintext-compared any more: it's hashed into
// settings.superAdminPasscodeHash on first run (see store.jsx), and from
// then on the owner can change it from the System Panel — see
// setSuperAdminPasscode in store.jsx. This constant only matters as the
// starting value for a fresh install.
// ---------------------------------------------------------------------------
export const APP_NAME = "Jnex POS system";
export const BRAND_FOOTER = "Powered by Jnex";

export const SUPER_ADMIN_PASSCODE = "Jnex@2026";

export const DEFAULT_OWNER_PASSCODE = "8888";
export const DEFAULT_CASHIER_PASSCODE = "0000";
// legacy (pre-roles) client passcode, migrated into the owner passcode
export const DEFAULT_CLIENT_PASSCODE = "1234";

export const MAX_ATTEMPTS = 5;
export const LOCKOUT_SECONDS = 30;

export const STORAGE_KEY = "aronium_pos_state_v1";

export const ROLE_LABEL = { super: "Super Admin", owner: "Owner", cashier: "Cashier" };
export const canSeeCost = (role) => role === "owner" || role === "super";

// Simple non-plaintext digest (mock phase only, swap for bcrypt/server auth later)
export function hashCode(value) {
  let h = 5381;
  const s = String(value) + "::aronium-salt";
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return "h" + h.toString(16);
}
