import { normalizeText } from "./normalize";

export type DeliveryRateRule = {
  id?: string;
  minDistanceKm: number;
  maxDistanceKm: number;
  fee: number;
  isActive?: boolean;
};

export type DeliverySurchargeRule = {
  id?: string;
  colonyName: string;
  aliases: string[];
  fee: number;
  isActive?: boolean;
};

export type DeliveryPriceResult =
  | {
      status: "quoted";
      distanceMeters: number;
      distanceKm: number;
      colony: string;
      baseFee: number;
      surcharge: number;
      totalFee: number;
    }
  | {
      status: "needs_handoff";
      distanceMeters: number;
      distanceKm: number;
      colony: string;
      reason: "outside_coverage" | "rate_not_found";
    };

function matchesColony(value: string, rule: DeliverySurchargeRule) {
  const colony = normalizeText(value);
  if (!colony) return false;
  return [rule.colonyName, ...rule.aliases]
    .map(normalizeText)
    .filter(Boolean)
    .some((candidate) => colony === candidate || colony.includes(candidate));
}

export function calculateDeliveryPrice(input: {
  distanceMeters: number;
  colony: string;
  rates: DeliveryRateRule[];
  surcharges: DeliverySurchargeRule[];
  maximumDistanceKm?: number;
}): DeliveryPriceResult {
  const distanceMeters = Math.max(0, Math.round(input.distanceMeters));
  const distanceKm = distanceMeters / 1000;
  const maximumDistanceKm = input.maximumDistanceKm ?? 15;

  if (distanceKm > maximumDistanceKm) {
    return {
      status: "needs_handoff",
      distanceMeters,
      distanceKm,
      colony: input.colony,
      reason: "outside_coverage",
    };
  }

  const rates = input.rates
    .filter((rate) => rate.isActive !== false)
    .sort((left, right) => left.maxDistanceKm - right.maxDistanceKm);
  const rate = rates.find((candidate, index) => {
    const aboveMinimum = index === 0
      ? distanceKm >= candidate.minDistanceKm
      : distanceKm > candidate.minDistanceKm;
    return aboveMinimum && distanceKm <= candidate.maxDistanceKm;
  });

  if (!rate) {
    return {
      status: "needs_handoff",
      distanceMeters,
      distanceKm,
      colony: input.colony,
      reason: "rate_not_found",
    };
  }

  const surchargeRule = input.surcharges
    .filter((rule) => rule.isActive !== false)
    .find((rule) => matchesColony(input.colony, rule));
  const surcharge = surchargeRule?.fee ?? 0;

  return {
    status: "quoted",
    distanceMeters,
    distanceKm,
    colony: surchargeRule?.colonyName ?? input.colony,
    baseFee: rate.fee,
    surcharge,
    totalFee: rate.fee + surcharge,
  };
}
