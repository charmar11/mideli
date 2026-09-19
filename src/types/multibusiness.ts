export type BusinessLifecycleStatus =
  | "draft"
  | "active"
  | "paused"
  | "archived"
  | "retired";

export type BusinessMembershipScope = "platform" | "organization" | "business";

export interface BusinessContextRow {
  organization_id: string;
  organization_slug: string;
  organization_name: string;
  organization_timezone: string;
  business_id: string;
  business_slug: string;
  business_display_name: string;
  business_timezone: string;
  business_lifecycle_status: BusinessLifecycleStatus;
  membership_id: string | null;
  membership_scope_type: BusinessMembershipScope | null;
  membership_role_code: string | null;
  capability_codes: string[];
}
