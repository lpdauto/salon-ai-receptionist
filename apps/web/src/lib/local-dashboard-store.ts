import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fallbackData, type AiSettings, type Business, type BusinessHour, type DashboardData, type Service } from "./dashboard-data";

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "dashboard.json");

function cloneData(data: DashboardData): DashboardData {
  return structuredClone(data);
}

async function readStore() {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    return JSON.parse(raw) as DashboardData;
  } catch {
    return cloneData(fallbackData);
  }
}

async function writeStore(data: DashboardData) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function getLocalDashboardData(): Promise<DashboardData> {
  const data = await readStore();
  return {
    ...data,
    isConnected: false,
  };
}

export async function updateLocalBusinessInfo(
  input: Pick<Business, "name" | "phone" | "address_line1" | "address_line2" | "city" | "state" | "postal_code" | "timezone">,
) {
  const data = await readStore();
  data.business = {
    ...data.business,
    ...input,
  };
  await writeStore(data);
}

export async function updateLocalBusinessHours(input: Omit<BusinessHour, "id" | "business_id" | "created_at">) {
  const data = await readStore();
  const existing = data.businessHours.find((hours) => hours.day_of_week === input.day_of_week);

  if (existing) {
    Object.assign(existing, input);
  } else {
    data.businessHours.push({
      id: `hours-${input.day_of_week}`,
      business_id: data.business.id,
      ...input,
    });
  }

  await writeStore(data);
}

export async function updateLocalService(serviceId: string, input: Omit<Service, "id">) {
  const data = await readStore();
  const existing = data.services.find((service) => service.id === serviceId);
  if (existing) {
    Object.assign(existing, input);
  }
  await writeStore(data);
}

export async function createLocalService(input: Omit<Service, "id">) {
  const data = await readStore();
  data.services.push({
    id: crypto.randomUUID(),
    ...input,
  });
  await writeStore(data);
}

export async function deleteLocalService(serviceId: string) {
  const data = await readStore();
  data.services = data.services.filter((service) => service.id !== serviceId);
  await writeStore(data);
}

export async function createLocalServiceCategory(input: { name: string; slug: string }) {
  const data = await readStore();
  if (data.serviceCategories.some((category) => category.slug === input.slug)) {
    return;
  }

  data.serviceCategories.push({
    id: crypto.randomUUID(),
    business_id: data.business.id,
    slug: input.slug,
    name: input.name,
    sort_order: (data.serviceCategories.length + 1) * 10,
  });
  await writeStore(data);
}

export async function deleteLocalServiceCategory(slug: string) {
  const data = await readStore();
  data.services = data.services.filter((service) => service.category !== slug);
  data.serviceCategories = data.serviceCategories.filter((category) => category.slug !== slug);
  await writeStore(data);
}

export async function updateLocalAiSettings(input: Pick<AiSettings, "greeting" | "personality" | "primary_language" | "supported_languages" | "language_detection_enabled">) {
  const data = await readStore();
  data.aiSettings = {
    ...data.aiSettings,
    ...input,
  };
  await writeStore(data);
}
