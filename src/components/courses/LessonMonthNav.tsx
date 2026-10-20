'use client';
import { useI18n } from '@/hooks/useI18n';
import { lessonMonthLabel, type LessonMonth, type Page } from '@/lib/lessonPaging';
import { Button } from '@/components/ui/button';

/**
 * Month selector and page controls for a list of lessons. A course can run for a year, so the list is read one month
 * and one page at a time; both controls only appear when they have something to change (more than one month, more
 * than one page), and the month names come from the lesson's own time zone.
 */
export function LessonMonthNav({ months, month, onMonth, page, onPage, canFilterByMonth }: {
  months: LessonMonth[]; month: string; onMonth: (month: string) => void;
  page: Page<unknown>; onPage: (page: number) => void; canFilterByMonth: boolean;
}) {
  const { t, locale } = useI18n();
  const filtering = canFilterByMonth && months.length > 1;
  if (!filtering && page.pages <= 1) return null;
  return <div className="space-y-3">
    {filtering && <label className="block text-sm">{t('courses.month')}
      <select className="mt-1 w-full min-h-11 rounded-xl border border-hairline bg-surface p-3 text-content"
        value={month} onChange={e => onMonth(e.target.value)}>
        {months.map(m => <option key={m.key} value={m.key}>{lessonMonthLabel(m.key, locale)} ({m.count})</option>)}
        <option value="">{t('courses.allMonths')}</option>
      </select></label>}
    {page.pages > 1 && <nav aria-label={t('courses.sessions')} className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span data-testid="lessons-shown">{t('courses.lessonsShown', { from: page.from, to: page.to, total: page.total })}</span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="min-h-11" disabled={page.page <= 1} onClick={() => onPage(page.page - 1)}>
          {t('courses.previousPage')}</Button>
        <span aria-hidden="true" data-testid="lesson-page">{t('courses.pageOf', { page: page.page, pages: page.pages })}</span>
        <Button size="sm" variant="outline" className="min-h-11" disabled={page.page >= page.pages} onClick={() => onPage(page.page + 1)}>
          {t('courses.nextPage')}</Button>
      </div>
    </nav>}
  </div>;
}
