"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Trash2, UserPlus } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "@/components/ui/button";
import { isStagingProject } from "@/lib/staging/stagingGate";
import {
  addStagingAccess,
  listStagingAccess,
  removeStagingAccess,
} from "@/lib/firebase/stagingAccessAdmin";

const QUERY_KEY = ["staging-access"];

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * Superadmin: who may sign in to the staging site (vfit-app-staging).
 *
 * Staging-only — the callables behind it are deployed only there, and on any other project
 * the page just says so. See docs/backend/roles-and-permissions.md, "Staging login allowlist".
 */
export default function StagingAccessPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const isSuperadmin = role === "superadmin";
  const onStaging = isStagingProject();
  const qc = useQueryClient();

  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (role && !isSuperadmin) router.replace("/admin");
  }, [role, isSuperadmin, router]);

  const list = useQuery({
    queryKey: QUERY_KEY,
    queryFn: listStagingAccess,
    enabled: isSuperadmin && onStaging,
    staleTime: 0,
  });

  const add = useMutation({
    mutationFn: addStagingAccess,
    onSuccess: () => {
      toast.success(t("admin.stagingAccess.added"));
      setEmail("");
      setNote("");
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err) => toast.error(errorMessage(err, t("admin.stagingAccess.addError"))),
  });

  const remove = useMutation({
    mutationFn: removeStagingAccess,
    onSuccess: () => {
      toast.success(t("admin.stagingAccess.removed"));
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err) => toast.error(errorMessage(err, t("admin.stagingAccess.removeError"))),
  });

  if (!isSuperadmin) return null;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    add.mutate({ email: trimmed, note: note.trim() || undefined });
  };

  const onRemove = (target: string) => {
    if (!confirm(t("admin.stagingAccess.confirmRemove", { email: target }))) return;
    remove.mutate(target);
  };

  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-content">{t("admin.stagingAccess.title")}</h1>
        <p className="text-content-muted mt-1">{t("admin.stagingAccess.subtitle")}</p>
      </div>

      {!onStaging ? (
        <div className="bg-surface rounded-2xl border border-hairline p-6">
          <p className="text-sm text-content-muted">{t("admin.stagingAccess.notStaging")}</p>
        </div>
      ) : (
        <>
          <form
            onSubmit={onSubmit}
            className="bg-surface rounded-2xl border border-hairline p-4 sm:p-6 space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#00C9FF]/20 flex items-center justify-center">
                <UserPlus className="w-5 h-5 text-[#00C9FF] light:text-cyan-700" />
              </div>
              <h2 className="text-lg font-semibold text-content">{t("admin.stagingAccess.addTitle")}</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[2fr_2fr_auto] gap-3 md:items-end">
              <label className="block">
                <span className="block text-sm font-medium text-content-muted mb-2">
                  {t("admin.stagingAccess.emailLabel")}
                </span>
                <input
                  type="email"
                  required
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full min-h-[44px] px-4 py-2.5 bg-surface-elevated border border-hairline rounded-xl text-content focus:outline-none focus:border-[#00C9FF]/50"
                />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-content-muted mb-2">
                  {t("admin.stagingAccess.noteLabel")}
                </span>
                <input
                  type="text"
                  maxLength={200}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("admin.stagingAccess.notePlaceholder")}
                  className="w-full min-h-[44px] px-4 py-2.5 bg-surface-elevated border border-hairline rounded-xl text-content focus:outline-none focus:border-[#00C9FF]/50"
                />
              </label>
              <Button type="submit" variant="primary" isLoading={add.isPending} className="min-h-[44px]">
                {t("admin.stagingAccess.addButton")}
              </Button>
            </div>
          </form>

          <div className="bg-surface rounded-2xl border border-hairline overflow-hidden">
            <div className="flex items-center gap-3 p-4 sm:p-6 border-b border-hairline">
              <KeyRound className="w-5 h-5 text-content-muted" />
              <h2 className="text-lg font-semibold text-content">
                {t("admin.stagingAccess.listTitle")}
                {list.data ? ` (${list.data.length})` : ""}
              </h2>
            </div>
            {list.isLoading ? (
              <p className="p-6 text-sm text-content-muted">{t("common.loading")}</p>
            ) : list.error ? (
              <p className="p-6 text-sm text-[#EF4444] light:text-red-700">
                {errorMessage(list.error, t("admin.stagingAccess.loadError"))}
              </p>
            ) : !list.data?.length ? (
              <p className="p-6 text-sm text-content-muted">{t("admin.stagingAccess.empty")}</p>
            ) : (
              <ul className="divide-y divide-hairline" data-testid="staging-access-list">
                {list.data.map((entry) => (
                  <li key={entry.email} className="flex items-center gap-3 px-4 sm:px-6 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-content break-all">{entry.email}</p>
                      <p className="text-xs text-content-muted mt-0.5 break-words">
                        {[
                          entry.note,
                          entry.addedBy && t("admin.stagingAccess.addedBy", { who: entry.addedBy }),
                          entry.addedAt && dateFmt.format(entry.addedAt),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemove(entry.email)}
                      disabled={remove.isPending}
                      aria-label={t("admin.stagingAccess.removeAria", { email: entry.email })}
                      className="w-11 h-11 flex-shrink-0 rounded-xl flex items-center justify-center text-[#EF4444] light:text-red-700 hover:bg-[#EF4444]/10 disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
