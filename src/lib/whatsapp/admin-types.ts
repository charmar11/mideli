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
    items: Array<{ name: string; quantity: number }>;
    total: number;
    serviceType: "domicilio" | "para_llevar" | null;
    address: string;
    addressReference: string;
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

export type WhatsappInboxSnapshot = {
  conversations: WhatsappAdminConversation[];
  conversationId: string | null;
  messages: WhatsappAdminMessage[];
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
