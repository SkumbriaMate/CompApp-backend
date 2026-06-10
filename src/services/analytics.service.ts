import { supabaseAdmin } from "../lib/supabase.js";

type ExpenseAnalyticsRow = {
  amount: number;
  currency: string;
  section_id: string | null;
  created_at: string;
};

export async function getAnalytics(companyId: string) {
  const { data: sections, error: sectionsError } = await supabaseAdmin
    .from("expense_sections")
    .select("id, name, sort_order")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (sectionsError) {
    throw new Error(sectionsError.message);
  }

  const { data: expenses, error: expensesError } = await supabaseAdmin
    .from("expenses")
    .select("amount, currency, section_id, created_at")
    .eq("company_id", companyId);

  if (expensesError) {
    throw new Error(expensesError.message);
  }

  const rows = (expenses ?? []) as ExpenseAnalyticsRow[];
  const sectionNames = new Map(
    (sections ?? []).map((s) => [s.id, s.name])
  );

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let totalAmount = 0;
  let thisMonthCount = 0;
  let thisMonthAmount = 0;
  const currency = rows[0]?.currency ?? "GEL";

  const sectionStats = new Map<
    string,
    { sectionId: string; name: string; count: number; totalAmount: number }
  >();

  for (const section of sections ?? []) {
    sectionStats.set(section.id, {
      sectionId: section.id,
      name: section.name,
      count: 0,
      totalAmount: 0,
    });
  }

  for (const row of rows) {
    const amount = Number(row.amount);
    totalAmount += amount;

    if (new Date(row.created_at) >= monthStart) {
      thisMonthCount += 1;
      thisMonthAmount += amount;
    }

    if (row.section_id) {
      const stat = sectionStats.get(row.section_id);
      if (stat) {
        stat.count += 1;
        stat.totalAmount += amount;
      } else {
        sectionStats.set(row.section_id, {
          sectionId: row.section_id,
          name: sectionNames.get(row.section_id) ?? "—",
          count: 1,
          totalAmount: amount,
        });
      }
    }
  }

  const bySection = Array.from(sectionStats.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return {
    totalRecords: rows.length,
    totalAmount,
    currency,
    thisMonth: {
      count: thisMonthCount,
      totalAmount: thisMonthAmount,
    },
    bySection,
  };
}
