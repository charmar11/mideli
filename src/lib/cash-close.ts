type CashCloseBreakdownInput = {
  openingFloat: number;
  cashTotal: number;
  fundInTotal: number;
  withdrawalTotal: number;
  expenseTotal: number;
  correctionTotal: number;
};

export type CashCloseBreakdownLine = {
  label: string;
  amount: number;
  operation: "add" | "subtract";
};

type OpeningFloatCorrectionInput = {
  currentAmount: number;
  nextAmount: number;
  reason: string;
};

export function buildBlindCashCountDisclosure(openingFloat: number) {
  return {
    openingFloat: Number.isFinite(openingFloat) ? Math.max(0, openingFloat) : 0,
    expectedCash: null,
  };
}

export function validateOpeningFloatCorrection(input: OpeningFloatCorrectionInput) {
  const amount = Math.round(input.nextAmount * 100) / 100;
  const currentAmount = Math.round(input.currentAmount * 100) / 100;
  const reason = input.reason.trim();

  if (!Number.isFinite(amount) || amount < 0) {
    return { amount, reason, error: "El fondo inicial no puede ser negativo." };
  }
  if (amount === currentAmount) {
    return { amount, reason, error: "El nuevo fondo debe ser diferente al actual." };
  }
  if (reason.length < 3) {
    return { amount, reason, error: "Escribe un motivo de al menos 3 caracteres." };
  }

  return { amount, reason, error: null };
}

export function buildCashCloseBreakdown(input: CashCloseBreakdownInput) {
  const lines: CashCloseBreakdownLine[] = [
    { label: "Fondo inicial", amount: input.openingFloat, operation: "add" },
    { label: "Ventas en efectivo", amount: input.cashTotal, operation: "add" },
    { label: "Entradas", amount: input.fundInTotal, operation: "add" },
    { label: "Retiros", amount: input.withdrawalTotal, operation: "subtract" },
    { label: "Gastos", amount: input.expenseTotal, operation: "subtract" },
    { label: "Correcciones", amount: input.correctionTotal, operation: "add" },
  ];
  const expectedCash = lines.reduce(
    (total, line) =>
      total + (line.operation === "subtract" ? -line.amount : line.amount),
    0
  );

  return { lines, expectedCash };
}
