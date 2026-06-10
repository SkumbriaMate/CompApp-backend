import { supabaseAdmin } from "../lib/supabase.js";

type SectionRow = {
  id: string;
  name: string;
  sort_order: number;
};

type ExpenseRow = {
  id: string;
  amount: number;
  currency: string;
  expense_date: string;
  created_at: string;
  title: string | null;
  receipt_url: string | null;
  section_id: string | null;
  employee: { full_name: string } | { full_name: string }[] | null;
  section: { id: string; name: string } | { id: string; name: string }[] | null;
};

function pickOne<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function getDashboardOverview(companyId: string) {
  const { data: sections, error: sectionsError } = await supabaseAdmin
    .from("expense_sections")
    .select("id, name, sort_order")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (sectionsError) {
    throw new Error(sectionsError.message);
  }

  const sectionList = (sections ?? []) as SectionRow[];

  const { data: expenseCounts, error: countError } = await supabaseAdmin
    .from("expenses")
    .select("section_id")
    .eq("company_id", companyId);

  if (countError) {
    throw new Error(countError.message);
  }

  const counts = new Map<string, number>();
  for (const row of expenseCounts ?? []) {
    if (!row.section_id) continue;
    counts.set(row.section_id, (counts.get(row.section_id) ?? 0) + 1);
  }

  const sectionsWithCounts = sectionList.map((section) => ({
    id: section.id,
    name: section.name,
    count: counts.get(section.id) ?? 0,
  }));

  const { data: recentRows, error: recentError } = await supabaseAdmin
    .from("expenses")
    .select(
      `
      id,
      amount,
      currency,
      expense_date,
      created_at,
      title,
      receipt_url,
      section_id,
      employee:profiles!expenses_employee_id_fkey(full_name),
      section:expense_sections(id, name)
    `
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (recentError) {
    throw new Error(recentError.message);
  }

  const recent = ((recentRows ?? []) as ExpenseRow[]).map((row) => {
    const employee = pickOne(row.employee);
    const section = pickOne(row.section);

    return {
      id: row.id,
      amount: Number(row.amount),
      currency: row.currency,
      expenseDate: row.expense_date,
      createdAt: row.created_at,
      title: row.title,
      receiptUrl: row.receipt_url,
      sectionId: section?.id ?? row.section_id,
      sectionName: section?.name ?? null,
      uploadedBy: employee?.full_name ?? null,
    };
  });

  return {
    sections: sectionsWithCounts,
    recent,
  };
}
