"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { Service, ServiceCategory } from "@/lib/dashboard-data";

type CategoryTabsProps = {
  activeCategory: string;
  categories: ServiceCategory[];
  deleteAction: (formData: FormData) => void | Promise<void>;
  firstCategory: string;
  services: Service[];
};

export function CategoryTabs({
  activeCategory,
  categories,
  deleteAction,
  firstCategory,
  services,
}: CategoryTabsProps) {
  const [isEditing, setIsEditing] = useState(false);

  function confirmDelete(event: FormEvent<HTMLFormElement>, categoryName: string, count: number) {
    const message =
      count > 0
        ? `Delete ${categoryName} and its ${count} service${count === 1 ? "" : "s"}?`
        : `Delete ${categoryName}?`;

    if (!window.confirm(message)) {
      event.preventDefault();
    }
  }

  return (
    <div className="mt-5 border-b border-slate-200 pb-3">
      <button
        className="mb-3 text-sm font-bold text-violet-700 underline-offset-4 hover:underline"
        onClick={() => setIsEditing((value) => !value)}
        type="button"
      >
        {isEditing ? "done editing" : "edit categories"}
      </button>

      <div className="flex flex-wrap gap-2">
        {categories.map((category) => {
          const count = services.filter((service) => (service.category || firstCategory) === category.slug).length;
          const isActive = category.slug === activeCategory;

          return (
            <div key={category.slug} className="relative">
              <Link
                href={`/dashboard/settings?category=${category.slug}`}
                className={`block whitespace-nowrap rounded-2xl px-4 py-3 text-sm font-bold transition ${
                  isActive
                    ? "bg-slate-950 text-white"
                    : "border border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
                }`}
              >
                {category.name}
                <span className={`ml-2 rounded-full px-2 py-1 text-xs ${isActive ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"}`}>
                  {count}
                </span>
              </Link>

              {isEditing ? (
                <form
                  action={deleteAction}
                  className="absolute -right-2 -top-2"
                  onSubmit={(event) => confirmDelete(event, category.name, count)}
                >
                  <input type="hidden" name="category" value={category.slug} />
                  <button
                    aria-label={`Delete ${category.name}`}
                    className="grid h-6 w-6 place-items-center rounded-full border border-rose-200 bg-white text-sm font-black leading-none text-rose-600 shadow-sm transition hover:bg-rose-50"
                    type="submit"
                  >
                    x
                  </button>
                </form>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
