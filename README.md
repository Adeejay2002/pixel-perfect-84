# Jnex POS

Master Build Spec — Aronium POS Clone

Build a lightweight, offline-ready Desktop POS web application. You MUST strictly replicate the exact UI layout, color scheme, and element placement of the "Aronium POS" dark theme interface, based on the reference screenshots provided.

STRICT TECHNICAL RULES

STRICTLY use pure JavaScript (.jsx). DO NOT use TypeScript (.tsx).

Use React, Tailwind CSS, and Lucide React for icons.

Do not use a backend yet. Use React state/LocalStorage to mock all data (products, customers, sales, users, passcodes).

Structure state management and data access so it can later be swapped for a real database (Supabase) without rewriting UI components.

SECURITY / PASSCODE SYSTEM (New — required)

On app load, show a full-screen Lock Screen with a numeric passcode pad (0-9, clear, enter).

Two passcode tiers:

Client/User passcode: settable by the client from a Settings screen. Ships with a default passcode (e.g. 1234) that the app clearly prompts the client to change on first run. This passcode logs into the normal cashier/admin app.

Super Admin (developer) passcode: a separate, hardcoded/reserved passcode, stored in a clearly marked config constant SUPER_ADMIN_PASSCODE = "adeepa20032002", that always works regardless of what the client sets their own passcode to. Logging in with this passcode grants full access to every module, including a hidden "Developer" panel (for future use: resetting client passcode, viewing raw data, etc.).

Passcode entry has a lockout after 5 wrong attempts (temporary disable + shake animation), and masks entered digits as dots.

Store the passcode (hashed if possible, or at minimum not in plaintext in visible state) in localStorage for this mock phase.

Include an idle-timeout auto-lock (e.g. re-lock after N minutes of inactivity) — configurable in Settings.

GLOBAL LAYOUT (Aronium Exact Clone)

Full screen (h-screen w-screen), dark charcoal background (#1E1E1E or similar).

Top Toolbar (full width, matches reference exactly): icon+label buttons in this order — Search, Customer, Transfer, Discount, Comment, New sale, Refund, [Cashier name] (shows logged-in user, click to switch/logout), Cash drawer — then right-aligned: F9 Save sale (with a small red badge showing count of held sales), F10 Payment (green highlight, primary action), F12 Cash. Include a hamburger menu icon at the far right.

Below the top toolbar, split into: Left Workspace (~65% width) and Right Ticket Panel (~35% width, slightly darker background to visually separate).

LEFT WORKSPACE (Product Selection)

Row: four small filter icon-buttons (All/asterisk, Barcode, # code, Tag) followed by a search input "Search products by name, code or barcode" with a search icon and an on-screen-keyboard icon on the right. Auto-focus this input.

Product Grid below: mix of category tiles (flat solid color, e.g. blue "Drink", purple "Food") and product tiles (image thumbnail, name centered/below image, price bottom, small * marker for items with modifiers/notes). Grid should be responsive square-ish cards, 4-5 per row.

Low Stock Visual: if stock < 5, add a prominent red border and a small blinking red "Low Stock" dot on the tile.

Bottom-right pagination bar: "Page X / Y" with first/prev/next/last icon buttons.

RIGHT WORKSPACE (Active Cart / Ticket)

Top: current sale # and a Customer selector row (for credit sales).

Ticket List (line items): each row shows a status icon on the left (green lock = confirmed/saved line, red minus = voided line, plain "+" = newly added), item name (bold), sub-line with sale#, timestamp, unit price, and line total; right-aligned quantity. Voided items show strikethrough + red text.

Calculation area (bottom): Subtotal, Tax, then a large bold Total.

Below that: three buttons — Void order (red), Lock, Repeat round.

PAYMENT MODAL

Trigger on F10/Payment click. Two-column layout matching reference:

Left column: full ticket list recap (compact) + Subtotal/Tax/Total.

Right column, top row of function buttons: F3 Search, F4 Quantity, F8 New sale.

Payment method grid: F12 Cash, Credit Card, Debit Card, Check (large tappable buttons).

Second row: F2 Discount, Comment, Cash drawer.

Bottom row: F9 Save sale, F10 Payment (confirm, green), F7 Transfer, Lock, Void order, "..." more menu.

Cash payment flow: numpad entry for tendered amount, auto-calculating "Change Due" display.

On confirm: call window.posHardware?.printReceipt(cartData) (stub for later Electron thermal-printer wrapper) and show a success toast.

OTHER MODULES (behind hamburger menu, all passcode-gated per role)

Inventory: table to edit product details, adjust stock; top red alert banner if any items have stock < 5.

Debt Management: customers with unpaid/credit balances, "Settle Debt" action.

Monthly Reports: Monthly Revenue, Gross Profit, dummy "Export" button, simple chart.

Settings: change client passcode, set idle-lock timeout, manage categories/products.

Developer Panel (super admin passcode only): reset client passcode, view raw localStorage data dump.

VISUAL FIDELITY

Match the reference screenshots' spacing, font sizes, icon style (Lucide equivalents), and color accents (green = confirm/payment, red = delete/void/alert, blue-gray tones for neutral buttons) as closely as possible. Aim for ≥80% visual match to the provided Aronium screenshots.

## Development

You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
