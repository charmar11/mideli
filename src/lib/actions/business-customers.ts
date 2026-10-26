"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSelectedBusinessContext } from "@/lib/server/selected-business";
import type { BusinessContextRow } from "@/types/multibusiness";
import type {
  BusinessCustomerAddress,
  BusinessCustomerDetails,
  BusinessCustomerDirectoryRow,
  BusinessCustomerMatch,
} from "@/types/business-customers";

type CustomerActionResult<T> = {
  success: boolean;
  data: T;
  error: string | null;
};

type AuthorizedBusiness = {
  businessId: string;
  businessName: string;
  logoPath: string | null;
  userId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
  admin: ReturnType<typeof createAdminClient>;
  contexts: BusinessContextRow[];
};

const EMPTY_MATCHES: BusinessCustomerMatch[] = [];

function failure<T>(error: string): CustomerActionResult<T> {
  return { success: false, data: null as T, error };
}

function success<T>(data: T): CustomerActionResult<T> {
  return { success: true, data, error: null };
}

async function authorizeSelectedBusiness(
  requestedBusinessId: string | null,
  access: "orders" | "manage_staff" | "catalog"
): Promise<{ scope: AuthorizedBusiness | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { scope: null, error: "Tu sesión expiró. Inicia sesión nuevamente." };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile?.is_active) {
    return { scope: null, error: "Esta cuenta está desactivada." };
  }

  const [contextResult, selected] = await Promise.all([
    supabase.rpc("get_my_multibusiness_context"),
    getSelectedBusinessContext(supabase),
  ]);
  if (contextResult.error || !selected.multibusinessAvailable) {
    return { scope: null, error: "No se pudo verificar el acceso al negocio." };
  }
  const businessId = requestedBusinessId ?? selected.businessId;
  if (!businessId) {
    return { scope: null, error: "Selecciona el negocio antes de continuar." };
  }

  const contexts = (contextResult.data ?? []) as BusinessContextRow[];
  const business = contexts.find((context) => context.business_id === businessId);
  if (!business || business.business_lifecycle_status !== "active") {
    return { scope: null, error: "Este negocio no está disponible." };
  }

  const licenseResult = await supabase.rpc("get_my_business_license_availability");
  const licenseAvailable = !licenseResult.error &&
    ((licenseResult.data ?? []) as Array<{ business_id: string; is_available: boolean }>)
      .some((license) => license.business_id === businessId && license.is_available === true);
  if (!licenseAvailable) {
    return { scope: null, error: "La licencia de este negocio no está vigente." };
  }

  const capabilities = business.capability_codes ?? [];
  const allowed = access === "orders"
    ? capabilities.includes("business.operate_orders") ||
      capabilities.includes("organization.operate_orders")
    : access === "manage_staff"
      ? capabilities.includes("business.manage_staff")
      : capabilities.includes("business.manage_catalog");
  if (!allowed) {
    return {
      scope: null,
      error: access === "orders"
        ? "No tienes permiso para operar pedidos en este negocio."
        : "No tienes permiso para administrar esta sección del negocio.",
    };
  }

  return {
    scope: {
      businessId,
      businessName: business.business_display_name,
      logoPath: business.business_brand_logo_path ?? null,
      userId: user.id,
      supabase,
      admin: createAdminClient(),
      contexts,
    },
    error: null,
  };
}

function mapAddress(row: {
  id: string;
  label: string | null;
  address_text: string;
  reference: string | null;
  formatted_address: string | null;
  colony: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  delivery_fee: number | null;
  is_default: boolean;
  confirmed_at: string | null;
  last_used_at: string;
}): BusinessCustomerAddress {
  return {
    id: row.id,
    label: row.label ?? "",
    addressText: row.address_text,
    reference: row.reference ?? "",
    formattedAddress: row.formatted_address ?? "",
    colony: row.colony ?? "",
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    deliveryFee: row.delivery_fee === null ? null : Number(row.delivery_fee),
    isDefault: row.is_default,
    confirmed: Boolean(row.confirmed_at),
    lastUsedAt: row.last_used_at,
  };
}

export async function searchPosBusinessCustomersAction(
  businessId: string,
  rawPhone: string
): Promise<CustomerActionResult<BusinessCustomerMatch[]>> {
  try {
    const { scope, error } = await authorizeSelectedBusiness(businessId, "orders");
    if (!scope) return failure(error ?? "No se pudo validar el negocio.");

    const digits = rawPhone.replace(/\D/g, "").slice(-15);
    if (digits.length < 4) return success(EMPTY_MATCHES);

    const { data: customers, error: customerError } = await scope.admin
      .from("business_customers")
      .select("id,phone,display_name")
      .eq("business_id", scope.businessId)
      .ilike("phone", `%${digits}%`)
      .limit(8);
    if (customerError) throw customerError;

    const rows = customers ?? [];
    if (rows.length === 0) return success(EMPTY_MATCHES);
    const customerIds = rows.map((customer) => customer.id);
    const { data: addresses, error: addressError } = await scope.admin
      .from("business_customer_addresses")
      .select("id,customer_id,label,address_text,reference,formatted_address,colony,latitude,longitude,delivery_fee,is_default,confirmed_at,last_used_at")
      .eq("business_id", scope.businessId)
      .in("customer_id", customerIds)
      .order("is_default", { ascending: false })
      .order("last_used_at", { ascending: false });
    if (addressError) throw addressError;

    const addressByCustomer = new Map<string, BusinessCustomerAddress[]>();
    for (const address of addresses ?? []) {
      const current = addressByCustomer.get(address.customer_id) ?? [];
      current.push(mapAddress(address));
      addressByCustomer.set(address.customer_id, current);
    }
    const matches = rows
      .map((customer) => ({
        id: customer.id,
        phone: customer.phone,
        displayName: customer.display_name ?? "",
        addresses: addressByCustomer.get(customer.id) ?? [],
      }))
      .sort((left, right) => Number(right.phone === digits) - Number(left.phone === digits));
    return success(matches);
  } catch {
    return failure("No se pudo buscar el cliente de este negocio.");
  }
}

export async function savePosBusinessCustomerAction(input: {
  businessId: string;
  customerId?: string | null;
  phone: string;
  displayName?: string;
}): Promise<CustomerActionResult<{ customerId: string }>> {
  try {
    const { scope, error } = await authorizeSelectedBusiness(input.businessId, "orders");
    if (!scope) return failure(error ?? "No se pudo validar el negocio.");

    const phone = input.phone.replace(/\D/g, "").slice(-15);
    if (phone.length < 8 || phone.length > 15) {
      return failure("Escribe un teléfono válido de 8 a 15 dígitos.");
    }
    const displayName = (input.displayName ?? "").trim().replace(/\s+/g, " ").slice(0, 120);

    if (input.customerId) {
      const { data: selected, error: selectedError } = await scope.admin
        .from("business_customers")
        .select("id,phone,display_name")
        .eq("business_id", scope.businessId)
        .eq("id", input.customerId)
        .maybeSingle();
      if (selectedError) throw selectedError;
      if (!selected || selected.phone !== phone) {
        return failure("El cliente seleccionado ya no coincide con el teléfono.");
      }
      if (displayName && displayName !== selected.display_name) {
        const { error: updateError } = await scope.admin
          .from("business_customers")
          .update({ display_name: displayName, updated_at: new Date().toISOString() })
          .eq("business_id", scope.businessId)
          .eq("id", selected.id);
        if (updateError) throw updateError;
      }
      return success({ customerId: selected.id });
    }

    const { data: existing, error: existingError } = await scope.admin
      .from("business_customers")
      .select("id,display_name")
      .eq("business_id", scope.businessId)
      .eq("phone", phone)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      if (displayName && displayName !== existing.display_name) {
        const { error: updateError } = await scope.admin
          .from("business_customers")
          .update({ display_name: displayName, updated_at: new Date().toISOString() })
          .eq("business_id", scope.businessId)
          .eq("id", existing.id);
        if (updateError) throw updateError;
      }
      return success({ customerId: existing.id });
    }

    const { data: inserted, error: insertError } = await scope.admin
      .from("business_customers")
      .insert({ business_id: scope.businessId, phone, display_name: displayName })
      .select("id")
      .single();
    if (insertError?.code === "23505") {
      const { data: concurrent, error: concurrentError } = await scope.admin
        .from("business_customers")
        .select("id")
        .eq("business_id", scope.businessId)
        .eq("phone", phone)
        .single();
      if (!concurrentError && concurrent) return success({ customerId: concurrent.id });
    }
    if (insertError || !inserted) throw insertError ?? new Error("No se pudo guardar el cliente");
    return success({ customerId: inserted.id });
  } catch {
    return failure("No se pudo guardar el cliente de este negocio.");
  }
}

export async function listBusinessCustomersAction(
  rawSearch = ""
): Promise<CustomerActionResult<BusinessCustomerDirectoryRow[]>> {
  try {
    const { scope, error } = await authorizeSelectedBusiness(null, "manage_staff");
    if (!scope) return failure(error ?? "No se pudo validar el negocio.");

    const search = rawSearch.trim().slice(0, 80);
    let query = scope.admin
      .from("business_customers")
      .select("id,phone,display_name,updated_at")
      .eq("business_id", scope.businessId)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (search) {
      const digits = search.replace(/\D/g, "");
      if (digits.length > 0 && digits.length === search.replace(/[\s()+.-]/g, "").length) {
        query = query.ilike("phone", `%${digits.slice(-15)}%`);
      } else {
        const safeTerm = search.replace(/[\\%_]/g, "\\$&");
        query = query.ilike("display_name", `%${safeTerm}%`);
      }
    }
    const { data: rows, error: listError } = await query;
    if (listError) throw listError;
    const customers = rows ?? [];
    if (customers.length === 0) return success([]);

    const { data: addressRows, error: addressError } = await scope.admin
      .from("business_customer_addresses")
      .select("customer_id")
      .eq("business_id", scope.businessId)
      .in("customer_id", customers.map((customer) => customer.id));
    if (addressError) throw addressError;
    const addressCounts = new Map<string, number>();
    for (const address of addressRows ?? []) {
      addressCounts.set(address.customer_id, (addressCounts.get(address.customer_id) ?? 0) + 1);
    }
    return success(customers.map((customer) => ({
      id: customer.id,
      phone: customer.phone,
      displayName: customer.display_name ?? "",
      addressCount: addressCounts.get(customer.id) ?? 0,
      updatedAt: customer.updated_at,
    })));
  } catch {
    return failure("No se pudo cargar la lista de clientes.");
  }
}

export async function getBusinessCustomerDetailsAction(
  customerId: string
): Promise<CustomerActionResult<BusinessCustomerDetails>> {
  try {
    const { scope, error } = await authorizeSelectedBusiness(null, "manage_staff");
    if (!scope) return failure(error ?? "No se pudo validar el negocio.");

    const [customerResult, addressesResult, ordersResult] = await Promise.all([
      scope.admin
        .from("business_customers")
        .select("id,phone,display_name,created_at,updated_at")
        .eq("business_id", scope.businessId)
        .eq("id", customerId)
        .maybeSingle(),
      scope.admin
        .from("business_customer_addresses")
        .select("id,customer_id,label,address_text,reference,formatted_address,colony,latitude,longitude,delivery_fee,is_default,confirmed_at,last_used_at")
        .eq("business_id", scope.businessId)
        .eq("customer_id", customerId)
        .order("is_default", { ascending: false })
        .order("last_used_at", { ascending: false }),
      scope.admin
        .from("orders")
        .select("id,number,type,status,total,delivery_address,delivery_colony,delivery_fee,payment_status,created_at", { count: "exact" })
        .eq("business_id", scope.businessId)
        .eq("business_customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);
    if (customerResult.error || addressesResult.error || ordersResult.error) {
      throw customerResult.error ?? addressesResult.error ?? ordersResult.error;
    }
    const customer = customerResult.data;
    if (!customer) return failure("No se encontró este cliente en el negocio seleccionado.");

    const orderRows = ordersResult.data ?? [];
    const orderIds = orderRows.map((order) => order.id);
    const allocationRows = orderIds.length > 0
      ? await scope.admin
          .from("payment_order_allocations")
          .select("order_id,transaction_id,discount_amount")
          .eq("business_id", scope.businessId)
          .in("order_id", orderIds)
      : { data: [], error: null };
    if (allocationRows.error) throw allocationRows.error;
    const allocations = allocationRows.data ?? [];
    const transactionIds = Array.from(new Set(allocations.map((row) => row.transaction_id)));
    const transactionsResult = transactionIds.length > 0
      ? await scope.admin
          .from("payment_transactions")
          .select("id,status")
          .eq("business_id", scope.businessId)
          .in("id", transactionIds)
      : { data: [], error: null };
    if (transactionsResult.error) throw transactionsResult.error;
    const completedTransactionIds = new Set(
      (transactionsResult.data ?? [])
        .filter((transaction) => transaction.status === "completed")
        .map((transaction) => transaction.id)
    );
    const orderDiscounts = new Map<string, number>();
    for (const allocation of allocations) {
      if (!completedTransactionIds.has(allocation.transaction_id)) continue;
      orderDiscounts.set(
        allocation.order_id,
        (orderDiscounts.get(allocation.order_id) ?? 0) + Number(allocation.discount_amount ?? 0)
      );
    }

    return success({
      id: customer.id,
      phone: customer.phone,
      displayName: customer.display_name ?? "",
      createdAt: customer.created_at,
      updatedAt: customer.updated_at,
      addresses: (addressesResult.data ?? []).map(mapAddress),
      orders: orderRows.map((order) => ({
        id: order.id,
        number: order.number,
        type: order.type,
        status: order.status,
        total: Number(order.total),
        discountAmount: orderDiscounts.get(order.id) ?? 0,
        deliveryAddress: order.delivery_address ?? "",
        deliveryColony: order.delivery_colony ?? "",
        deliveryFee: Number(order.delivery_fee ?? 0),
        paymentStatus: order.payment_status,
        createdAt: order.created_at,
      })),
      totalOrders: ordersResult.count ?? 0,
    });
  } catch {
    return failure("No se pudo abrir el detalle del cliente.");
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeAddressForComparison(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-MX");
}

export async function createBusinessCustomerAddressAction(input: {
  customerId: string;
  label: string;
  addressText: string;
  colony: string;
  reference?: string;
}): Promise<CustomerActionResult<BusinessCustomerAddress>> {
  try {
    const { scope, error } = await authorizeSelectedBusiness(null, "manage_staff");
    if (!scope) return failure(error ?? "No se pudo validar el negocio.");
    if (!isUuid(input.customerId)) return failure("No se pudo validar el cliente.");

    const label = input.label.trim().replace(/\s+/g, " ").slice(0, 80) || "Casa";
    const addressText = input.addressText.trim().replace(/\s+/g, " ");
    const colony = input.colony.trim().replace(/\s+/g, " ").slice(0, 120);
    const reference = (input.reference ?? "").trim().replace(/\s+/g, " ").slice(0, 300);
    if (addressText.length < 8 || addressText.length > 500) {
      return failure("Escribe una dirección de entre 8 y 500 caracteres.");
    }
    if (colony.length < 2) return failure("Escribe la colonia o fraccionamiento.");

    const [customerResult, addressesResult] = await Promise.all([
      scope.admin
        .from("business_customers")
        .select("id")
        .eq("business_id", scope.businessId)
        .eq("id", input.customerId)
        .maybeSingle(),
      scope.admin
        .from("business_customer_addresses")
        .select("address_text")
        .eq("business_id", scope.businessId)
        .eq("customer_id", input.customerId),
    ]);
    if (customerResult.error || addressesResult.error) {
      throw customerResult.error ?? addressesResult.error;
    }
    if (!customerResult.data) return failure("No se encontró este cliente en el negocio seleccionado.");

    const existingAddresses = addressesResult.data ?? [];
    const normalizedAddress = normalizeAddressForComparison(addressText);
    if (existingAddresses.some((address) => normalizeAddressForComparison(address.address_text) === normalizedAddress)) {
      return failure("Ese domicilio ya está guardado para este cliente.");
    }

    const columns = "id,label,address_text,reference,formatted_address,colony,latitude,longitude,delivery_fee,is_default,confirmed_at,last_used_at";
    const insertAddress = (isDefault: boolean) => scope.admin
      .from("business_customer_addresses")
      .insert({
        business_id: scope.businessId,
        customer_id: input.customerId,
        label,
        address_text: addressText,
        reference,
        formatted_address: addressText,
        colony,
        is_default: isDefault,
      })
      .select(columns)
      .single();

    let inserted = await insertAddress(existingAddresses.length === 0);
    if (inserted.error?.code === "23505") {
      const { data: afterConflict, error: recheckError } = await scope.admin
        .from("business_customer_addresses")
        .select("address_text")
        .eq("business_id", scope.businessId)
        .eq("customer_id", input.customerId);
      if (recheckError) throw recheckError;
      if ((afterConflict ?? []).some((address) => normalizeAddressForComparison(address.address_text) === normalizedAddress)) {
        return failure("Ese domicilio ya está guardado para este cliente.");
      }
      if (existingAddresses.length === 0) inserted = await insertAddress(false);
    }
    if (inserted.error || !inserted.data) throw inserted.error ?? new Error("No se pudo guardar el domicilio");

    return success(mapAddress(inserted.data));
  } catch {
    return failure("No se pudo guardar el domicilio de este cliente.");
  }
}

export async function deleteBusinessCustomerAddressAction(input: {
  customerId: string;
  addressId: string;
}): Promise<CustomerActionResult<{ deleted: true; defaultAddressSet: boolean }>> {
  try {
    const { scope, error } = await authorizeSelectedBusiness(null, "manage_staff");
    if (!scope) return failure(error ?? "No se pudo validar el negocio.");
    if (!isUuid(input.customerId) || !isUuid(input.addressId)) {
      return failure("No se pudo validar el domicilio seleccionado.");
    }

    const { data: address, error: addressError } = await scope.admin
      .from("business_customer_addresses")
      .select("id,is_default")
      .eq("business_id", scope.businessId)
      .eq("customer_id", input.customerId)
      .eq("id", input.addressId)
      .maybeSingle();
    if (addressError) throw addressError;
    if (!address) return failure("No se encontró ese domicilio en el negocio seleccionado.");

    const replacementResult = address.is_default
      ? await scope.admin
          .from("business_customer_addresses")
          .select("id")
          .eq("business_id", scope.businessId)
          .eq("customer_id", input.customerId)
          .neq("id", input.addressId)
          .order("last_used_at", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle()
      : { data: null, error: null };
    if (replacementResult.error) throw replacementResult.error;

    const { data: deleted, error: deleteError } = await scope.admin
      .from("business_customer_addresses")
      .delete()
      .eq("business_id", scope.businessId)
      .eq("customer_id", input.customerId)
      .eq("id", input.addressId)
      .select("id")
      .maybeSingle();
    if (deleteError) throw deleteError;
    if (!deleted) return failure("No se encontró ese domicilio en el negocio seleccionado.");

    let defaultAddressSet = true;
    if (address.is_default && replacementResult.data) {
      const { error: promoteError } = await scope.admin
        .from("business_customer_addresses")
        .update({ is_default: true })
        .eq("business_id", scope.businessId)
        .eq("customer_id", input.customerId)
        .eq("id", replacementResult.data.id);
      defaultAddressSet = !promoteError;
    }

    return success({ deleted: true, defaultAddressSet });
  } catch {
    return failure("No se pudo eliminar el domicilio de este cliente.");
  }
}
