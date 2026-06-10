import { supabaseAdmin } from "../lib/supabase.js";

export async function listSections(companyId: string) {
  const { data: sections, error: sectionsError } = await supabaseAdmin
    .from("expense_sections")
    .select("id, name, sort_order")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (sectionsError) {
    throw new Error(sectionsError.message);
  }

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

  return (sections ?? []).map((section) => ({
    id: section.id,
    name: section.name,
    sortOrder: section.sort_order,
    count: counts.get(section.id) ?? 0,
  }));
}

export async function createSection(companyId: string, name: string) {
  const trimmed = name.trim();

  if (!trimmed) {
    throw new Error("Section name is required");
  }

  const { data: existing } = await supabaseAdmin
    .from("expense_sections")
    .select("id")
    .eq("company_id", companyId)
    .eq("name", trimmed)
    .maybeSingle();

  if (existing) {
    throw new Error("A section with this name already exists");
  }

  const { data: last } = await supabaseAdmin
    .from("expense_sections")
    .select("sort_order")
    .eq("company_id", companyId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder = (last?.sort_order ?? 0) + 1;

  const { data, error } = await supabaseAdmin
    .from("expense_sections")
    .insert({
      company_id: companyId,
      name: trimmed,
      sort_order: sortOrder,
    })
    .select("id, name, sort_order")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create section");
  }

  return {
    id: data.id,
    name: data.name,
    sortOrder: data.sort_order,
    count: 0,
  };
}
