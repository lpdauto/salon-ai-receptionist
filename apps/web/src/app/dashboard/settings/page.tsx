import { DashboardShell } from "@/components/DashboardShell";
import { getDashboardData } from "@/lib/dashboard-data";
import { CategoryTabs } from "./CategoryTabs";
import {
  createService,
  createServiceCategory,
  deleteService,
  deleteServiceCategory,
  updateAiSettings,
  updateBusinessHours,
  updateBusinessInfo,
  updateService,
} from "./actions";

type SettingsPageProps = {
  searchParams?: Promise<{
    category?: string;
    settings_error?: string;
  }>;
};

const languageOptions = ["English", "Vietnamese", "Cantonese", "Mandarin", "Spanish"];
const timezones = ["America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York"];
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function dollarsFromCents(cents: number | null) {
  return cents === null ? "" : String(cents / 100);
}

function timeValue(value: string | null) {
  return value ? value.slice(0, 5) : "";
}

const inputClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100";
const compactInputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100";
const textareaClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100";
const saveButtonClass = "rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-violet-700";
const compactButtonClass = "rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-violet-700";

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const data = await getDashboardData();
  const params = await searchParams;
  const firstCategory = data.serviceCategories[0]?.slug ?? "manicure";
  const activeCategory = data.serviceCategories.some((category) => category.slug === params?.category)
    ? params?.category ?? firstCategory
    : firstCategory;
  const activeCategoryData = data.serviceCategories.find((category) => category.slug === activeCategory);
  const activeCategoryLabel = activeCategoryData?.name ?? "Menu";
  const visibleServices = data.services.filter((service) => (service.category || firstCategory) === activeCategory);

  return (
    <DashboardShell title="Settings" eyebrow="Salon controls">
      <div className="grid gap-5">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-black tracking-tight">Business info</h2>
              <p className="mt-1 text-sm text-slate-500">Basic details the receptionist can use when answering calls.</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
              {data.isConnected ? "Supabase" : "Local dev data"}
            </span>
          </div>
          {!data.isConnected ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              Supabase is not configured, so dashboard changes are being saved locally in apps/web/.data/dashboard.json.
            </div>
          ) : null}

          <form action={updateBusinessInfo} className="mt-4 grid gap-3 md:grid-cols-12">
            <label className="block md:col-span-4">
              <span className="text-sm font-semibold text-slate-600">Business name</span>
              <input name="name" defaultValue={data.business.name} required className={`mt-1.5 ${compactInputClass}`} />
            </label>
            <label className="block md:col-span-3">
              <span className="text-sm font-semibold text-slate-600">Phone number</span>
              <input name="phone" defaultValue={data.business.phone ?? ""} className={`mt-1.5 ${compactInputClass}`} />
            </label>
            <label className="block md:col-span-3">
              <span className="text-sm font-semibold text-slate-600">Street address</span>
              <input name="address_line1" defaultValue={data.business.address_line1 ?? ""} className={`mt-1.5 ${compactInputClass}`} />
            </label>
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-slate-600">Suite / unit</span>
              <input name="address_line2" defaultValue={data.business.address_line2 ?? ""} className={`mt-1.5 ${compactInputClass}`} />
            </label>
            <label className="block md:col-span-3">
              <span className="text-sm font-semibold text-slate-600">City</span>
              <input name="city" defaultValue={data.business.city ?? ""} className={`mt-1.5 ${compactInputClass}`} />
            </label>
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-slate-600">State</span>
              <input name="state" defaultValue={data.business.state ?? ""} className={`mt-1.5 ${compactInputClass}`} />
            </label>
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-slate-600">ZIP code</span>
              <input name="postal_code" defaultValue={data.business.postal_code ?? ""} className={`mt-1.5 ${compactInputClass}`} />
            </label>
            <label className="block md:col-span-3">
              <span className="text-sm font-semibold text-slate-600">Timezone</span>
              <select name="timezone" defaultValue={data.business.timezone} className={`mt-1.5 ${compactInputClass}`}>
                {timezones.map((timezone) => (
                  <option key={timezone} value={timezone}>
                    {timezone}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end md:col-span-2">
              <button className="w-full rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-violet-700">
                Save
              </button>
            </div>
          </form>
        </section>

        <details className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer list-none">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-black tracking-tight">Business hours</h2>
                <p className="mt-1 text-sm text-slate-500">Open this panel only when hours need changes.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">
                {data.businessHours.filter((hours) => !hours.is_closed).length} open days
              </span>
            </div>
          </summary>
          <div className="mt-5 grid gap-2">
            {data.businessHours.map((hours) => (
              <form
                key={hours.day_of_week}
                action={updateBusinessHours}
                className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[8rem_1fr_1fr_auto_auto]"
              >
                <input type="hidden" name="day_of_week" value={hours.day_of_week} />
                <div className="self-center text-sm font-black text-slate-950">{days[hours.day_of_week]}</div>
                <input aria-label={`${days[hours.day_of_week]} open time`} name="opens_at" type="time" defaultValue={timeValue(hours.opens_at)} className={compactInputClass} />
                <input aria-label={`${days[hours.day_of_week]} close time`} name="closes_at" type="time" defaultValue={timeValue(hours.closes_at)} className={compactInputClass} />
                <label className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
                  <input name="is_closed" type="checkbox" defaultChecked={hours.is_closed} className="h-4 w-4 accent-violet-700" />
                  Closed
                </label>
                <button className={compactButtonClass}>Save</button>
              </form>
            ))}
          </div>
        </details>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-black tracking-tight">Services and prices</h2>
              <p className="mt-1 text-sm text-slate-500">Manage menu categories and compact service rows.</p>
            </div>
            <span className="rounded-full bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700">
              {visibleServices.length} in {activeCategoryLabel}
            </span>
          </div>

          <CategoryTabs
            activeCategory={activeCategory}
            categories={data.serviceCategories}
            deleteAction={deleteServiceCategory}
            firstCategory={firstCategory}
            services={data.services}
          />

          <form action={createServiceCategory} className="mt-4 grid gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3 sm:grid-cols-[1fr_auto]">
            <input name="name" placeholder="New category name" className={compactInputClass} />
            <button className={compactButtonClass}>Add category</button>
          </form>

          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
            <div className="hidden grid-cols-[1.1fr_7rem_1.4fr_auto_auto] gap-3 bg-slate-100 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-500 lg:grid">
              <div>Service</div>
              <div>Price</div>
              <div>Description</div>
              <div>Active</div>
              <div>Actions</div>
            </div>

            <div className="divide-y divide-slate-200">
              {visibleServices.map((service) => (
                <form key={service.id} action={updateService} className="grid gap-3 bg-white p-4 lg:grid-cols-[1.1fr_7rem_1.4fr_auto_auto] lg:items-center">
                  <input type="hidden" name="service_id" value={service.id} />
                  <input type="hidden" name="category" value={activeCategory} />
                  <label>
                    <span className="mb-1 block text-xs font-bold text-slate-500 lg:hidden">Service</span>
                    <input name="name" defaultValue={service.name} required className={compactInputClass} />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-bold text-slate-500 lg:hidden">Price</span>
                    <input name="price" type="number" min="0" step="0.01" defaultValue={dollarsFromCents(service.price_cents)} className={compactInputClass} />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-bold text-slate-500 lg:hidden">Description</span>
                    <textarea name="description" defaultValue={service.description ?? ""} rows={2} className={`${compactInputClass} resize-y`} />
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                    <input name="is_active" type="checkbox" defaultChecked={service.is_active} className="h-4 w-4 accent-violet-700" />
                    Active
                  </label>
                  <div className="flex gap-2">
                    <button className={compactButtonClass}>Save</button>
                    <button formAction={deleteService} className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-50">
                      Delete
                    </button>
                  </div>
                </form>
              ))}

              <form action={createService} className="grid gap-3 bg-violet-50 p-4 lg:grid-cols-[1.1fr_7rem_1.4fr_auto_auto] lg:items-center">
                <input type="hidden" name="category" value={activeCategory} />
                <input name="name" placeholder={`New ${activeCategoryLabel} service`} required className={compactInputClass} />
                <input name="price" type="number" min="0" step="0.01" placeholder="Price" className={compactInputClass} />
                <textarea name="description" rows={2} placeholder="Description" className={`${compactInputClass} resize-y`} />
                <label className="flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-bold text-violet-900">
                  <input name="is_active" type="checkbox" defaultChecked className="h-4 w-4 accent-violet-700" />
                  Active
                </label>
                <button className={compactButtonClass}>Add</button>
              </form>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black tracking-tight">AI settings</h2>
          <form action={updateAiSettings} className="mt-5 grid gap-4">
            <label>
              <span className="text-sm font-semibold text-slate-600">Greeting</span>
              <textarea name="greeting" defaultValue={data.aiSettings.greeting} rows={3} className={`mt-2 ${textareaClass}`} />
            </label>
            <label>
              <span className="text-sm font-semibold text-slate-600">Personality</span>
              <textarea name="personality" defaultValue={data.aiSettings.personality} rows={3} className={`mt-2 ${textareaClass}`} />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className="text-sm font-semibold text-slate-600">Primary language</span>
                <select name="primary_language" defaultValue={data.aiSettings.primary_language} className={`mt-2 ${inputClass}`}>
                  {languageOptions.map((language) => (
                    <option key={language} value={language}>
                      {language}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-7 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                <input name="language_detection_enabled" type="checkbox" defaultChecked={data.aiSettings.language_detection_enabled} className="h-4 w-4 accent-violet-700" />
                Language detection enabled
              </label>
            </div>
            <fieldset>
              <legend className="text-sm font-semibold text-slate-600">Supported languages</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {languageOptions.map((language) => (
                  <label key={language} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                    <input name="supported_languages" type="checkbox" value={language} defaultChecked={data.aiSettings.supported_languages.includes(language)} className="h-4 w-4 accent-violet-700" />
                    {language}
                  </label>
                ))}
              </div>
            </fieldset>
            <button className={saveButtonClass}>Save AI settings</button>
          </form>
        </section>
      </div>
    </DashboardShell>
  );
}
