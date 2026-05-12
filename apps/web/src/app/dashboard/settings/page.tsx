import { DashboardShell } from "@/components/DashboardShell";
import { formatMoney, getDashboardData } from "@/lib/dashboard-data";

const languageOptions = ["English", "Vietnamese", "Cantonese", "Mandarin"];

export default async function SettingsPage() {
  const data = await getDashboardData();

  return (
    <DashboardShell title="Settings" eyebrow="Configuration shell">
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black tracking-tight">Salon profile</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-slate-600">Salon name</span>
              <input value={data.business.name} readOnly className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-600">Primary phone</span>
              <input value={data.business.phone ?? ""} readOnly className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-600">Timezone</span>
              <input value={data.business.timezone} readOnly className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-600">Data source</span>
              <input value={data.isConnected ? "Supabase connected" : "Fallback placeholder data"} readOnly className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700" />
            </label>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black tracking-tight">Multilingual AI receptionist</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Lightweight MVP controls for future caller language detection and salon-specific voice behavior.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-slate-600">Primary language</span>
              <select value={data.aiSettings.primary_language} disabled className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {languageOptions.map((language) => (
                  <option key={language}>{language}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-600">Language detection</span>
              <input value={data.aiSettings.language_detection_enabled ? "Enabled" : "Disabled"} readOnly className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700" />
            </label>
          </div>
          <div className="mt-4">
            <span className="text-sm font-semibold text-slate-600">Supported languages</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {languageOptions.map((language) => {
                const enabled = data.aiSettings.supported_languages.includes(language);
                return (
                  <span
                    key={language}
                    className={`rounded-full px-3 py-2 text-xs font-bold ${
                      enabled
                        ? "bg-violet-50 text-violet-700"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {language}
                  </span>
                );
              })}
            </div>
          </div>
          <label className="mt-4 block">
            <span className="text-sm font-semibold text-slate-600">AI greeting</span>
            <textarea value={data.aiSettings.greeting} readOnly rows={3} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700" />
          </label>
          <label className="mt-4 block">
            <span className="text-sm font-semibold text-slate-600">AI personality</span>
            <textarea value={data.aiSettings.personality} readOnly rows={3} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700" />
          </label>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <h2 className="text-xl font-black tracking-tight">Services</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {data.services.map((service) => (
              <article key={service.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="font-black text-slate-950">{service.name}</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{service.description}</p>
                <div className="mt-4 flex items-center justify-between text-sm font-bold">
                  <span>{formatMoney(service.price_cents)}</span>
                  <span>{service.duration_minutes ?? "--"} min</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
