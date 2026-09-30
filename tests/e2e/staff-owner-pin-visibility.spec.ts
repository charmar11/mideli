import { expect, test } from "@playwright/test";
import { filterVisibleBusinessStaffMemberships } from "../../src/lib/staff-roles";

const memberships = [
  { user_id: "owner-just-dipping", role_code: "business_owner" },
  { user_id: "owner-other-business", role_code: "business_owner" },
  { user_id: "waiter-1", role_code: "local_waiter" },
  { user_id: "kitchen-1", role_code: "local_kitchen" },
];

test("el personal local incluye al dueño actual, pero no expone a otros dueños", () => {
  const visible = filterVisibleBusinessStaffMemberships(
    memberships,
    "owner-just-dipping",
  );

  expect(visible).toEqual([
    memberships[0],
    memberships[2],
    memberships[3],
  ]);
});

test("la lista local conserva al personal aunque no sea dueño", () => {
  const visible = filterVisibleBusinessStaffMemberships(
    memberships.slice(2),
    "owner-just-dipping",
  );

  expect(visible).toEqual(memberships.slice(2));
});
