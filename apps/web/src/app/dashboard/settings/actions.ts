"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveDashboardBusinessId } from "@/lib/dashboard-data";
import {
  createLocalService,
  createLocalServiceCategory,
  deleteLocalService,
  deleteLocalServiceCategory,
  updateLocalAiSettings,
  updateLocalBusinessHours,
  updateLocalBusinessInfo,
  updateLocalService,
} from "@/lib/local-dashboard-store";

function getAdminClientForAction() {
  const supabase = createAdminClient();
  if (!supabase) {
    console.error(
      "[settings] Supabase admin client is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to apps/web/.env.local to save dashboard changes.",
    );
    return null;
  }

  return supabase;
}

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function nullableTextValue(formData: FormData, key: string) {
  const value = textValue(formData, key);
  return value.length > 0 ? value : null;
}

function nullableNumberValue(formData: FormData, key: string) {
  const value = textValue(formData, key);
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function serviceCategoryValue(formData: FormData) {
  const category = textValue(formData, "category");
  return category || "manicure";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeTime(value: string | null) {
  if (!value) {
    return null;
  }

  return /^\d{2}:\d{2}$/.test(value) ? value : null;
}

function supportedLanguagesFromForm(formData: FormData) {
  const selected = formData
    .getAll("supported_languages")
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());

  return selected.length > 0 ? selected : [textValue(formData, "primary_language") || "English"];
}

function isMissingColumnError(error: { message?: string; code?: string } | null) {
  return error?.code === "PGRST204" || error?.message?.toLowerCase().includes("category") === true;
}

function isMissingTableError(error: { message?: string; code?: string } | null) {
  return error?.code === "42P01" || error?.message?.toLowerCase().includes("service_categories") === true;
}

async function revalidateSettings() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
}

export async function updateBusinessInfo(formData: FormData) {
  const businessId = await resolveDashboardBusinessId();
  const supabase = getAdminClientForAction();
  if (!supabase) {
    await updateLocalBusinessInfo({
      name: textValue(formData, "name"),
      phone: nullableTextValue(formData, "phone"),
      address_line1: nullableTextValue(formData, "address_line1"),
      address_line2: nullableTextValue(formData, "address_line2"),
      city: nullableTextValue(formData, "city"),
      state: nullableTextValue(formData, "state"),
      postal_code: nullableTextValue(formData, "postal_code"),
      timezone: textValue(formData, "timezone") || "America/Los_Angeles",
    });
    await revalidateSettings();
    return;
  }

  const { error } = await supabase
    .from("businesses")
    .update({
      name: textValue(formData, "name"),
      phone: nullableTextValue(formData, "phone"),
      address_line1: nullableTextValue(formData, "address_line1"),
      address_line2: nullableTextValue(formData, "address_line2"),
      city: nullableTextValue(formData, "city"),
      state: nullableTextValue(formData, "state"),
      postal_code: nullableTextValue(formData, "postal_code"),
      timezone: textValue(formData, "timezone") || "America/Los_Angeles",
    })
    .eq("id", businessId);

  if (error) {
    console.error("[settings] Failed to update business info.", error);
    await revalidateSettings();
    return;
  }

  await revalidateSettings();
}

export async function updateBusinessHours(formData: FormData) {
  const businessId = await resolveDashboardBusinessId();
  const dayOfWeek = Number(textValue(formData, "day_of_week"));
  const isClosed = formData.get("is_closed") === "on";
  const supabase = getAdminClientForAction();
  if (!supabase) {
    await updateLocalBusinessHours({
      day_of_week: dayOfWeek,
      opens_at: isClosed ? null : normalizeTime(nullableTextValue(formData, "opens_at")),
      closes_at: isClosed ? null : normalizeTime(nullableTextValue(formData, "closes_at")),
      is_closed: isClosed,
    });
    await revalidateSettings();
    return;
  }

  const { error } = await supabase.from("business_hours").upsert(
    {
      business_id: businessId,
      day_of_week: dayOfWeek,
      opens_at: isClosed ? null : normalizeTime(nullableTextValue(formData, "opens_at")),
      closes_at: isClosed ? null : normalizeTime(nullableTextValue(formData, "closes_at")),
      is_closed: isClosed,
    },
    {
      onConflict: "business_id,day_of_week",
    },
  );

  if (error) {
    console.error("[settings] Failed to update business hours.", error);
    await revalidateSettings();
    return;
  }

  await revalidateSettings();
}

export async function updateService(formData: FormData) {
  const businessId = await resolveDashboardBusinessId();
  const serviceId = textValue(formData, "service_id");
  const priceDollars = nullableNumberValue(formData, "price");
  const updatePayload = {
    name: textValue(formData, "name"),
    category: serviceCategoryValue(formData),
    description: nullableTextValue(formData, "description"),
    price_cents: priceDollars === null ? null : Math.round(priceDollars * 100),
    duration_minutes: nullableNumberValue(formData, "duration_minutes"),
    is_active: formData.get("is_active") === "on",
  };
  const supabase = getAdminClientForAction();
  if (!supabase) {
    await updateLocalService(serviceId, updatePayload);
    await revalidateSettings();
    return;
  }

  const { error } = await supabase
    .from("services")
    .update(updatePayload)
    .eq("id", serviceId)
    .eq("business_id", businessId);

  if (error) {
    if (isMissingColumnError(error)) {
      const legacyPayload: Omit<typeof updatePayload, "category"> = {
        name: updatePayload.name,
        description: updatePayload.description,
        price_cents: updatePayload.price_cents,
        duration_minutes: updatePayload.duration_minutes,
        is_active: updatePayload.is_active,
      };
      const { error: legacyError } = await supabase
        .from("services")
        .update(legacyPayload)
        .eq("id", serviceId)
        .eq("business_id", businessId);

      if (!legacyError) {
        await revalidateSettings();
        return;
      }
    }

    console.error("[settings] Failed to update service.", error);
    await revalidateSettings();
    return;
  }

  await revalidateSettings();
}

export async function createService(formData: FormData) {
  const businessId = await resolveDashboardBusinessId();
  const priceDollars = nullableNumberValue(formData, "price");
  const insertPayload = {
    business_id: businessId,
    category: serviceCategoryValue(formData),
    name: textValue(formData, "name"),
    description: nullableTextValue(formData, "description"),
    price_cents: priceDollars === null ? null : Math.round(priceDollars * 100),
    duration_minutes: nullableNumberValue(formData, "duration_minutes"),
    is_active: formData.get("is_active") === "on",
  };
  const supabase = getAdminClientForAction();
  if (!supabase) {
    await createLocalService(insertPayload);
    await revalidateSettings();
    return;
  }

  const { error } = await supabase.from("services").insert(insertPayload);

  if (error) {
    if (isMissingColumnError(error)) {
      const legacyPayload: Omit<typeof insertPayload, "category"> = {
        business_id: insertPayload.business_id,
        name: insertPayload.name,
        description: insertPayload.description,
        price_cents: insertPayload.price_cents,
        duration_minutes: insertPayload.duration_minutes,
        is_active: insertPayload.is_active,
      };
      const { error: legacyError } = await supabase.from("services").insert(legacyPayload);

      if (!legacyError) {
        await revalidateSettings();
        return;
      }
    }

    console.error("[settings] Failed to create service.", error);
    await revalidateSettings();
    return;
  }

  await revalidateSettings();
}

export async function createServiceCategory(formData: FormData) {
  const businessId = await resolveDashboardBusinessId();
  const name = textValue(formData, "name");
  const slug = slugify(name);

  if (!name || !slug) {
    await revalidateSettings();
    return;
  }

  const supabase = getAdminClientForAction();
  if (!supabase) {
    await createLocalServiceCategory({ name, slug });
    await revalidateSettings();
    return;
  }

  const { count, error: countError } = await supabase
    .from("service_categories")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);

  if (isMissingTableError(countError)) {
    console.error("[settings] service_categories table is missing. Run supabase/service_categories_table.sql.");
    await revalidateSettings();
    return;
  }

  const { error } = await supabase.from("service_categories").insert({
    business_id: businessId,
    name,
    slug,
    sort_order: ((count ?? 0) + 1) * 10,
  });

  if (error) {
    console.error("[settings] Failed to create service category.", error);
    await revalidateSettings();
    return;
  }

  await revalidateSettings();
}

export async function deleteServiceCategory(formData: FormData) {
  const businessId = await resolveDashboardBusinessId();
  const slug = serviceCategoryValue(formData);
  const supabase = getAdminClientForAction();
  if (!supabase) {
    await deleteLocalServiceCategory(slug);
    await revalidateSettings();
    return;
  }

  const { error: serviceError } = await supabase
    .from("services")
    .delete()
    .eq("business_id", businessId)
    .eq("category", slug);

  if (serviceError) {
    console.error("[settings] Failed to delete services in category.", serviceError);
    await revalidateSettings();
    return;
  }

  const { error } = await supabase
    .from("service_categories")
    .delete()
    .eq("business_id", businessId)
    .eq("slug", slug);

  if (error) {
    if (!isMissingTableError(error)) {
      console.error("[settings] Failed to delete service category.", error);
    }
    await revalidateSettings();
    return;
  }

  await revalidateSettings();
}

export async function deleteService(formData: FormData) {
  const businessId = await resolveDashboardBusinessId();
  const serviceId = textValue(formData, "service_id");
  const supabase = getAdminClientForAction();
  if (!supabase) {
    await deleteLocalService(serviceId);
    await revalidateSettings();
    return;
  }

  const { error } = await supabase
    .from("services")
    .delete()
    .eq("id", serviceId)
    .eq("business_id", businessId);

  if (error) {
    console.error("[settings] Failed to delete service.", error);
    await revalidateSettings();
    return;
  }

  await revalidateSettings();
}

export async function updateAiSettings(formData: FormData) {
  const businessId = await resolveDashboardBusinessId();
  const supabase = getAdminClientForAction();
  if (!supabase) {
    await updateLocalAiSettings({
      greeting: textValue(formData, "greeting"),
      personality: textValue(formData, "personality"),
      primary_language: textValue(formData, "primary_language") || "English",
      supported_languages: supportedLanguagesFromForm(formData),
      language_detection_enabled: formData.get("language_detection_enabled") === "on",
    });
    await revalidateSettings();
    return;
  }

  const { error } = await supabase.from("ai_settings").upsert(
    {
      business_id: businessId,
      greeting: textValue(formData, "greeting"),
      personality: textValue(formData, "personality"),
      primary_language: textValue(formData, "primary_language") || "English",
      supported_languages: supportedLanguagesFromForm(formData),
      language_detection_enabled: formData.get("language_detection_enabled") === "on",
    },
    {
      onConflict: "business_id",
    },
  );

  if (error) {
    console.error("[settings] Failed to update AI settings.", error);
    await revalidateSettings();
    return;
  }

  await revalidateSettings();
}
