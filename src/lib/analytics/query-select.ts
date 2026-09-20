/**
 * Projection used by the analytics order breakdowns.
 *
 * The multibusiness schema keeps both the historical category_id foreign key
 * and the business-scoped composite foreign key. PostgREST needs the
 * relationship name when both are present.
 */
export const ANALYTICS_ORDER_SELECT = `
  id,
  number,
  type,
  total,
  payment_method,
  paid_at,
  order_items (
    menu_item_id,
    quantity,
    unit_price,
    menu_items (
      name,
      categories!menu_items_business_category_fkey (name)
    )
  )
`;
