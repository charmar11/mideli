export interface ModifierOption {
  id?: string;
  name: string;
  price: number;
  description?: string;
}

export interface ModifierGroup {
  id?: string;
  name: string;
  required: boolean;
  selection_mode?: "single" | "multiple";
  min_selections?: number;
  max_selections?: number | null;
  options: ModifierOption[];
}

export interface Category {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MenuItem {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  is_active: boolean;
  whatsapp_enabled?: boolean;
  sort_order: number;
  modifiers: ModifierGroup[];
  image_url: string;
  created_at: string;
  updated_at: string;
}

export type TableShape = "round" | "square" | "rectangle" | "bar";

export interface TableZone {
  id: string;
  name: string;
  sort_order: number;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RestaurantTable {
  id: string;
  zone_id: string | null;
  name: string;
  shape: TableShape;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  rotation: number;
  capacity: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TableMapLabel {
  id: string;
  label_text: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  background_color: string;
  text_color: string;
  border_color: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type InventoryMovementType =
  | "purchase"
  | "adjustment"
  | "consumption"
  | "return"
  | "waste"
  | "count_correction"
  | "internal_use"
  | "damage"
  | "expired";

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  minimum_stock: number;
  target_stock: number;
  cost_per_unit: number;
  preferred_supplier: string;
  storage_location: string;
  count_frequency_days: number;
  tracks_expiry: boolean;
  last_counted_at: string | null;
  purchase_unit: string;
  purchase_conversion_factor: number;
  minimum_purchase_quantity: number;
  preferred_supplier_phone: string;
  last_purchase_package_cost: number;
  last_purchase_at: string | null;
  stock_version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InventoryRecipe {
  id: string;
  menu_item_id: string;
  inventory_item_id: string;
  quantity: number;
  modifier_group_id: string | null;
  modifier_option_id: string | null;
  modifier_group_name: string | null;
  modifier_option_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryMovement {
  id: string;
  inventory_item_id: string;
  order_id: string | null;
  order_item_id: string | null;
  movement_type: InventoryMovementType;
  quantity_change: number;
  note: string;
  created_by: string | null;
  previous_stock: number | null;
  resulting_stock: number | null;
  reason_code: string;
  count_id: string | null;
  receipt_id: string | null;
  lot_id: string | null;
  unit_cost_snapshot: number | null;
  order_number_snapshot: number | null;
  reference_label: string;
  created_at: string;
}

export interface InventoryCount {
  id: string;
  scope: "full" | "critical";
  status: "draft" | "submitted" | "reconciled" | "cancelled";
  notes: string;
  requires_review: boolean;
  started_by: string;
  completed_by: string | null;
  reviewed_by: string | null;
  started_at: string;
  completed_at: string | null;
  reviewed_at: string | null;
  updated_at: string;
}

export interface InventoryCountLine {
  id: string;
  count_id: string;
  inventory_item_id: string;
  expected_stock: number;
  counted_stock: number | null;
  variance: number | null;
  expected_stock_version: number;
  reason_code: string;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryPurchaseOrder {
  id: string;
  number: number;
  status: "draft" | "ordered" | "partially_received" | "received" | "cancelled";
  supplier: string;
  notes: string;
  created_by: string;
  ordered_at: string | null;
  expected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryPurchaseOrderLine {
  id: string;
  purchase_order_id: string;
  inventory_item_id: string;
  ordered_quantity: number;
  received_quantity: number;
  expected_unit_cost: number;
  ordered_purchase_quantity: number;
  received_purchase_quantity: number;
  purchase_unit_snapshot: string;
  conversion_factor_snapshot: number;
  expected_package_cost: number;
  created_at: string;
  updated_at: string;
}

export interface InventoryLot {
  id: string;
  inventory_item_id: string;
  receipt_line_id: string | null;
  lot_code: string;
  quantity_received: number;
  quantity_remaining: number;
  unit_cost: number;
  expires_on: string | null;
  storage_location: string;
  received_at: string;
  created_at: string;
}

export interface SelectedModifier {
  group_id?: string;
  option_id?: string;
  group: string;
  option: string;
  price: number;
  description?: string;
}

export interface CartItem {
  id: string;
  menu_item_id: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
  selected_modifiers: SelectedModifier[];
}

export interface Order {
  id: string;
  creation_key?: string | null;
  cash_shift_id?: string | null;
  number: number;
  status: "pending" | "in_kitchen" | "ready" | "served" | "paid" | "cancelled";
  type: "comedor" | "domicilio" | "para_llevar";
  total: number;
  notes: string;
  table_number?: string | null;
  table_id?: string | null;
  table_zone_id?: string | null;
  table_zone_name?: string | null;
  customer_name?: string | null;
  source_channel?: "pos" | "whatsapp";
  channel_conversation_id?: string | null;
  customer_id?: string | null;
  customer_phone?: string | null;
  delivery_address?: string | null;
  delivery_reference?: string | null;
  delivery_fee?: number;
  delivery_status?: "pending" | "searching_driver" | "driver_on_way" | "customer_received";
  external_order_id?: string | null;
  payment_method_requested?: "efectivo" | "tarjeta" | "transferencia" | null;
  requested_cash_tendered?: number | null;
  cash_received?: number | null;
  change_given?: number | null;
  created_by: string | null;
  payment_method: "efectivo" | "tarjeta" | "transferencia" | null;
  payment_status: "unpaid" | "partial" | "paid";
  paid_amount: number;
  paid_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  phone: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

export interface CustomerAddress {
  id: string;
  customer_id: string;
  label: string;
  address_text: string;
  reference: string;
  latitude: number | null;
  longitude: number | null;
  formatted_address?: string | null;
  colony?: string | null;
  distance_meters?: number | null;
  delivery_fee?: number | null;
  geocoded_at?: string | null;
  is_default: boolean;
  last_used_at: string;
  created_at: string;
  updated_at: string;
}

export interface ChannelConversation {
  id: string;
  provider: "meta";
  external_contact_id: string;
  customer_id: string;
  status: "active" | "handoff" | "confirmed" | "cancelled" | "closed";
  stage: string;
  state: Record<string, unknown>;
  assigned_to: string | null;
  bot_enabled?: boolean;
  assigned_at?: string | null;
  handoff_reason?: string | null;
  closed_at?: string | null;
  content_redacted_at?: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChannelMessage {
  id: string;
  conversation_id: string;
  provider: "meta";
  external_message_id: string;
  direction: "inbound" | "outbound";
  message_type: "text" | "location" | "unsupported" | "system";
  body: string;
  status: "received" | "processing" | "sent" | "delivered" | "read" | "failed" | "ignored";
  metadata: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
  redacted_at?: string | null;
}

export interface WhatsappChannelSettings {
  id: 1;
  receive_enabled: boolean;
  auto_reply_enabled: boolean;
  create_orders_enabled: boolean;
  delivery_quotes_enabled: boolean;
  status_notifications_enabled: boolean;
  human_handoff_enabled: boolean;
  timezone: string;
  catalog_page_size: number;
  message_retention_days: number;
  store_address: string;
  store_latitude: number | null;
  store_longitude: number | null;
  closed_message: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsappBusinessHours {
  id: string;
  day_of_week: number;
  is_open: boolean;
  opens_at: string;
  closes_at: string;
  updated_by: string | null;
  updated_at: string;
}

export interface WhatsappDeliveryRate {
  id: string;
  min_distance_km: number;
  max_distance_km: number;
  fee: number;
  sort_order: number;
  is_active: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsappDeliverySurcharge {
  id: string;
  colony_name: string;
  aliases: string[];
  fee: number;
  is_active: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsappDeliveryQuote {
  id: string;
  conversation_id: string;
  customer_address_id: string | null;
  input_address: string;
  formatted_address: string;
  colony: string;
  latitude: number | null;
  longitude: number | null;
  distance_meters: number | null;
  base_fee: number;
  surcharge: number;
  total_fee: number;
  status: "quoted" | "needs_handoff" | "failed";
  failure_reason: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export type OnboardingStatus =
  | "not_started"
  | "in_progress"
  | "skipped"
  | "completed";

export interface UserOnboardingProgress {
  user_id: string;
  role: Profile["role"];
  version: number;
  status: OnboardingStatus;
  current_step: number;
  completed_steps: string[];
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  notes: string;
  selected_modifiers: SelectedModifier[];
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  role: "owner" | "admin" | "waiter" | "kitchen" | "supervisor";
  is_active: boolean;
  deactivated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffMember extends Profile {
  email: string | null;
  last_sign_in_at: string | null;
  banned_until: string | null;
}
