import { expect, test } from "@playwright/test";
import { serviceFunctionHeaders } from "@/lib/supabase/function-auth";

test("las Edge Functions reciben explícitamente el secreto como Bearer", () => {
  expect(serviceFunctionHeaders("test-secret")).toEqual({
    Authorization: "Bearer test-secret",
  });
});
