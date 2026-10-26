export type BusinessCustomerAddress = {
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

export type BusinessCustomerMatch = {
  id: string;
  phone: string;
  displayName: string;
  addresses: BusinessCustomerAddress[];
};

export type BusinessCustomerDirectoryRow = {
  id: string;
  phone: string;
  displayName: string;
  addressCount: number;
  updatedAt: string;
};

export type BusinessCustomerOrderSummary = {
  id: string;
  number: number;
  type: "comedor" | "domicilio" | "para_llevar";
  status: string;
  total: number;
  discountAmount: number;
  deliveryAddress: string;
  deliveryColony: string;
  deliveryFee: number;
  paymentStatus: string;
  createdAt: string;
};

export type BusinessCustomerDetails = {
  id: string;
  phone: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  addresses: BusinessCustomerAddress[];
  orders: BusinessCustomerOrderSummary[];
  totalOrders: number;
};
