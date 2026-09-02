import type {
  WhatsappBusinessHours,
  WhatsappChannelSettings,
  WhatsappDeliveryRate,
  WhatsappDeliverySurcharge,
} from "@/types/database";

export type WhatsappAdminRole = "owner" | "admin" | "waiter" | "supervisor";

export type WhatsappAdminConversation = {
  id: string;
  phone: string;
  customerName: string;
  status: string;
  stage: string;
  botEnabled: boolean;
  assignedTo: string | null;
  assignedName: string;
  handoffReason: string;
  updatedAt: string;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastMessage: string;
  lastMessageDirection: "inbound" | "outbound" | null;
  lastMessageStatus: string;
  latestOrder: {
    id: string;
    number: number;
    status: string;
    type: string;
    total: number;
    paymentStatus: string;
    deliveryStatus: string;
    deliveryAddress: string;
    deliveryReference: string;
    paymentMethod: string;
    requestedCashTendered: number | null;
    createdAt: string;
  } | null;
  context: {
    items: Array<{ name: string; quantity: number; notes: string }>;
    total: number;
    serviceType: "domicilio" | "para_llevar" | null;
    address: string;
    addressReference: string;
    addressConfirmed: boolean;
    orderNotes: string;
    deliveryNotes: string;
    paymentMethod: string;
  };
};

export type WhatsappAdminMessage = {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  status: string;
  occurredAt: string;
};

export type WhatsappPosDraft = {
  conversationId: string;
  customerId: string | null;
  orderId: string | null;
  orderNumber: number | null;
  phone: string;
  customerName: string;
  orderType: "domicilio" | "para_llevar" | null;
  notes: string;
  address: string;
  reference: string;
  addressConfirmed: boolean;
  latitude: number | null;
  longitude: number | null;
  distanceMeters: number | null;
  deliveryFee: number;
  paymentMethod: "efectivo" | "transferencia" | null;
  cashTendered: number | null;
  items: Array<{
    id: string;
    menu_item_id: string;
    name: string;
    price: number;
    quantity: number;
    notes: string;
    selected_modifiers: Array<{
      group_id?: string;
      option_id?: string;
      group: string;
      option: string;
      price: number;
      description?: string;
    }>;
  }>;
};

export type PosCustomerMatch = {
  id: string;
  phone: string;
  displayName: string;
  addresses: WhatsappCustomerAddress[];
};

export type WhatsappInboxSnapshot = {
  conversations: WhatsappAdminConversation[];
  conversationId: string | null;
  messages: WhatsappAdminMessage[];
};

export type WhatsappCustomerSummary = {
  id: string;
  phone: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  orderCount: number;
  paidOrderCount: number;
  totalPaid: number;
  lastOrderAt: string | null;
  lastOrderNumber: number | null;
  lastConversationId: string | null;
  lastConversationStatus: string;
};

export type WhatsappCustomerAddress = {
  id: string;
  label: string;
  addressText: string;
  reference: string;
  formattedAddress: string;
  colony: string;
  latitude: number | null;
  longitude: number | null;
  deliveryFee: number | null;
  isDefault: boolean;
  confirmed: boolean;
  lastUsedAt: string;
};

export type WhatsappCustomerOrder = {
  id: string;
  number: number;
  status: string;
  type: string;
  total: number;
  paidAmount: number;
  paymentStatus: string;
  paymentMethod: string;
  sourceChannel: string;
  deliveryStatus: string;
  deliveryAddress: string;
  deliveryReference: string;
  deliveryFee: number;
  channelConversationId: string | null;
  createdAt: string;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    unitPrice: number;
    notes: string;
  }>;
};

export type WhatsappCustomerDetail = {
  customer: WhatsappCustomerSummary;
  addresses: WhatsappCustomerAddress[];
  orders: WhatsappCustomerOrder[];
};

export type WhatsappCustomerDirectory = {
  query: string;
  customers: WhatsappCustomerSummary[];
};

export type WhatsappAdminCatalogItem = {
  id: string;
  name: string;
  categoryName: string;
  isActive: boolean;
  whatsappEnabled: boolean;
};

export type WhatsappAdminScheduleException = {
  id: string;
  serviceDate: string;
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
  note: string;
};

export type WhatsappControlData = {
  role: WhatsappAdminRole;
  userId: string;
  persisted: boolean;
  settings: WhatsappChannelSettings;
  hours: WhatsappBusinessHours[];
  scheduleExceptions: WhatsappAdminScheduleException[];
  rates: WhatsappDeliveryRate[];
  surcharges: WhatsappDeliverySurcharge[];
  conversations: WhatsappAdminConversation[];
  catalog: WhatsappAdminCatalogItem[];
  metrics: {
    active: number;
    handoff: number;
    confirmedToday: number;
    failedMessages: number;
  };
  diagnostics: {
    integrationEnabled: boolean;
    providerReady: boolean;
    webhookSecurityReady: boolean;
    googleMapsReady: boolean;
    geminiReady: boolean;
    storeOriginReady: boolean;
    dryRun: boolean;
    orderCreationEnabled: boolean;
    orderCreationServerEnabled: boolean;
    orderCreationSettingEnabled: boolean;
    allowedTestPhones: number;
    failedNotifications: Array<{
      id: string;
      orderNumber: number;
      eventKey: string;
      attempts: number;
      lastError: string;
      createdAt: string;
    }>;
  };
};

export type WhatsappActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };
