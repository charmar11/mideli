# Findings: método de pago y mensaje al repartidor

## Current flow

- `src/components/pos/order-details-modal.tsx` already knows the payment-method
  union, but its local-delivery section only displays a read-only summary when
  a value is set. There is no Efectivo/Transferencia selector.
- `src/components/dashboard/mesero-view.tsx` owns
  `deliveryPaymentMethod` and passes it into order create/edit. It currently
  defaults to `null`.
- `src/lib/stores/order-store.ts` persists the requested payment method into
  the existing `payment_method_requested` order field.
- `src/lib/pos-cart-draft.ts` persists the cart and non-personal order context,
  but not the payment method. It must validate an optional known enum so older
  stored drafts remain readable; do not store customer phone or address.
- `src/lib/order-totals.ts` defines the customer delivery total as the saved
  product total plus delivery fee for `domicilio` orders.
- `src/components/dashboard/status-view.tsx` builds the manual courier message.
  It currently passes `requested_cash_tendered` as the cash amount; the new
  message should instead use the saved product total only.
- `src/lib/delivery-driver-message.ts` formats the WhatsApp text, includes the
  customer and map sections, and only prints a cash amount for Efectivo.
- Focused E2E files exist at `tests/e2e/delivery-driver-message.spec.ts` and
  `tests/e2e/pos-cart-draft.spec.ts`.

## Design reviewed and approved

See `docs/superpowers/specs/2026-10-09-pago-domicilio-mensaje-repartidor-design.md`.

- Explicit, required Efectivo or Transferencia for local domicilios.
- Efectivo: `Productos: $X + envío`; `$X` is saved product total, and no
  combined total or numeric delivery fee is shown.
- Transferencia: method only, no cash amount.
- Platforms, comedor, para llevar, registers/cash shifts, automatic WhatsApp
  notices, and legacy tendered-cash storage stay unchanged.
- No migration is expected.

## Worktree note

The repository already contains numerous unrelated modifications and deletions,
including Impeccable skill files. Do not clean, reset, or include them in this
task.
