-- Unifica domicilios que representan el mismo resultado canónico de Maps.
-- La tabla ya impedía repetir el texto capturado, pero una ubicación compartida
-- y una dirección escrita podían tener distintos address_text y el mismo
-- formatted_address.

CREATE TEMP TABLE customer_address_dedup_map ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    id,
    customer_id,
    row_number() OVER (
      PARTITION BY customer_id,
        lower(
          regexp_replace(
            regexp_replace(
              btrim(COALESCE(NULLIF(formatted_address, ''), address_text)),
              '\s+',
              ' ',
              'g'
            ),
            '\s*,\s*',
            ', ',
            'g'
          )
        )
      ORDER BY (confirmed_at IS NOT NULL) DESC,
        is_default DESC,
        last_used_at DESC,
        created_at ASC,
        id
    ) AS duplicate_rank,
    first_value(id) OVER (
      PARTITION BY customer_id,
        lower(
          regexp_replace(
            regexp_replace(
              btrim(COALESCE(NULLIF(formatted_address, ''), address_text)),
              '\s+',
              ' ',
              'g'
            ),
            '\s*,\s*',
            ', ',
            'g'
          )
        )
      ORDER BY (confirmed_at IS NOT NULL) DESC,
        is_default DESC,
        last_used_at DESC,
        created_at ASC,
        id
    ) AS keeper_id
  FROM public.customer_addresses
)
SELECT id AS duplicate_id, keeper_id
FROM ranked
WHERE duplicate_rank > 1;

UPDATE public.whatsapp_delivery_quotes AS quote
SET customer_address_id = mapping.keeper_id
FROM customer_address_dedup_map AS mapping
WHERE quote.customer_address_id = mapping.duplicate_id;

DELETE FROM public.customer_addresses AS address
USING customer_address_dedup_map AS mapping
WHERE address.id = mapping.duplicate_id;

CREATE UNIQUE INDEX IF NOT EXISTS customer_addresses_canonical_unique
  ON public.customer_addresses (
    customer_id,
    lower(
      regexp_replace(
        regexp_replace(
          btrim(COALESCE(NULLIF(formatted_address, ''), address_text)),
          '\s+',
          ' ',
          'g'
        ),
        '\s*,\s*',
        ', ',
        'g'
      )
    )
  );
