# Task: Método de pago y texto para el repartidor

## Goal

En pedidos de domicilio local, exigir que Mesero elija Efectivo o Transferencia.
Al compartir manualmente con el repartidor, mostrar `Productos: $X + envío`
únicamente para efectivo, sin sumar ni imprimir un total final. Mantener intactos
plataformas, comedor, para llevar, cobros y caja.

## Phases

- [x] Phase 1: Inspect current POS, draft, totals, message, and tests.
- [x] Phase 2: Agree on behavior and review the design specification.
- [x] Phase 3: Prepare this implementation plan.
- [x] Phase 4: Add the required two-choice selector for local delivery; block
      both submit actions until selected; persist only the method enum in the
      local cart draft.
- [x] Phase 5: Build the courier message as `Productos: $X + envío`, using the
      saved product total only; show only Transferencia for transfers.
- [x] Phase 6: Add/update focused tests for the message, draft restore, required
      selection, and unaffected order types/platforms.
- [x] Phase 7: Run targeted Playwright tests, `npm run lint`, and `npm run build`;
      report any physical WhatsApp check that remains.
- [x] Phase 8: Deploy the verified version to Vercel production and confirm
      `READY` plus the production alias through Vercel metadata. Do not create
      real orders, send a real WhatsApp message, or fetch the deployed URL.

## Decisions

| Decision | Rationale | Date |
|---|---|---|
| Offer only Efectivo and Transferencia for local delivery POS orders. | Owner confirmed these two choices; no card option. | 2026-10-09 |
| Require an explicit choice before sending or cobrar/enviar. | Prevents a new local order from reaching the driver message as `Por definir`. | 2026-10-09 |
| Cash text shows saved product total followed by literal `+ envío`; do not compute a combined total. | Owner selected `Productos $X + envío` without a summed amount; no tendered-bill or change fields. | 2026-10-09 |
| Transferencia message has no cash amount. | It is a payment-method notice, not money for the courier to collect. | 2026-10-09 |
| Scope selector/validation to local domicilio; leave platforms and other types unchanged. | Avoids coupling platform payment semantics to local delivery. | 2026-10-09 |
| No database migration; reuse `payment_method_requested`. | Field already exists and is persisted by the order store. | 2026-10-09 |
| Persist only the payment-method enum in the local draft. | Restore the workflow without adding phone/address PII to browser storage. | 2026-10-09 |
| Deploy to Vercel after verification. | Owner explicitly requested production deploy at the end of this task. | 2026-10-09 |

## Errors Encountered

| Error | Attempt | Resolution |
|---|---|---|
| `writing-plans` skill was not installed in the available skill roots. | Searched `.codex/skills` and `.agents/skills`. | Used the installed `planning` skill as the closest available fallback. |
| Two initial documentation patch attempts had mismatched context. | No files were changed by the failed attempts. | Re-read the exact current lines and applied a narrower successful patch. |
| An initial large patch for the Mesero component did not match current context. | No partial edit from that attempt was applied. | Re-read the relevant functions and applied smaller targeted patches. |
| The first build found one existing message test still passing `cashAmount`. | TypeScript rejected the obsolete input property. | Updated that regression test to assert the new `productAmount` wording; build then passed. |

## Guardrails

- Preserve the dirty worktree and all unrelated changes.
- Do not remove `requested_cash_tendered`; legacy flows may still use it. The new
  courier message must not use it as the product amount.
- Keep the manual **Enviar a repartidor** action and existing customer/maps
  sections.
- No real order, payment, cash-shift, WhatsApp send, database write, or deploy
  during automated validation.
