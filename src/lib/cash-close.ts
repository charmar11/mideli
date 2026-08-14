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
