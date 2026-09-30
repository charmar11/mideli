import { expect, test } from "@playwright/test";
import { ANALYTICS_ORDER_SELECT } from "@/lib/analytics/query-select";
import { fetchAllRows } from "@/lib/analytics/fetch-all-rows";
import {
  getTodayKey,
  normalizePeriod,
  parseDateKey,
  periodFromAnchor,
  periodTimestamps,
  queryTimestamp,
} from "@/lib/analytics/period";

test("analíticas inicia en el día actual cuando no hay periodo en la URL", () => {
  const today = getTodayKey();
  expect(normalizePeriod()).toEqual({ view: "dia", from: today, to: today });
});

test("analíticas consulta todas las páginas sin perder filas en el límite", async () => {
  const source = Array.from({ length: 1_025 }, (_, id) => ({ id }));
  const requested: Array<[number, number]> = [];
  const result = await fetchAllRows((from, to) => {
    requested.push([from, to]);
    return Promise.resolve({ data: source.slice(from, to + 1), error: null });
  });

  expect(result.error).toBeNull();
  expect(result.data).toEqual(source);
  expect(requested).toEqual([[0, 499], [500, 999], [1000, 1499]]);
});

test("analíticas no muestra un reporte parcial si falla una página", async () => {
  const result = await fetchAllRows((from) =>
    Promise.resolve(
      from === 0
        ? { data: Array.from({ length: 500 }, (_, id) => id), error: null }
        : { data: null, error: { message: "timeout" } }
    )
  );

  expect(result).toEqual({ data: [], error: { message: "timeout" } });
});

test("semana y mes parten del ancla actual sin desplazarse por la zona horaria", () => {
  const today = parseDateKey("2026-09-06");

  expect(periodFromAnchor("semana", today, today)).toEqual({
    view: "semana",
    from: "2026-08-31",
    to: "2026-09-06",
  });
  expect(periodFromAnchor("mes", today, today)).toEqual({
    view: "mes",
    from: "2026-09-01",
    to: "2026-09-06",
  });
});

test("las consultas conservan el límite operativo de Hermosillo", () => {
  expect(queryTimestamp("2026-09-06", "start")).toBe("2026-09-06T00:00:00-07:00");
  expect(queryTimestamp("2026-09-06", "end")).toBe("2026-09-06T23:59:59.999-07:00");
});

test("el periodo compartido genera límites reutilizables para otras vistas", () => {
  const period = periodFromAnchor("semana", parseDateKey("2026-09-06"), parseDateKey("2026-09-06"));
  expect(periodTimestamps(period)).toEqual({
    desde: "2026-08-31T00:00:00-07:00",
    hasta: "2026-09-06T23:59:59.999-07:00",
  });
});

test("analíticas usa la relación de categoría delimitada por negocio", () => {
  expect(ANALYTICS_ORDER_SELECT).toContain(
    "categories!menu_items_business_category_fkey (name)"
  );
});
