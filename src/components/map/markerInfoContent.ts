export interface MarkerInfo {
  name: string;
  city: string;
  /** Already formatted in the app locale (`formatDecimal(rating, locale, 1)`). */
  rating: string;
  reviewsLabel: string;
  partnerLabel?: string;
  /** The pop-up's way in: a real link (so it can be opened in a new tab or focused), whose
   *  plain clicks `onClick` may take over for in-app navigation. */
  link?: { href: string; label: string; onClick?: (event: MouseEvent) => void };
}

/**
 * The marker pop-up's content for `google.maps.InfoWindow`.
 *
 * Built from theme-token classes so it follows light/dark like the rest of the app (the
 * InfoWindow's own chrome is themed in globals.css), and filled with `textContent`: names come
 * from provider profiles, so they never go through innerHTML.
 */
export function markerInfoContent(info: MarkerInfo): HTMLElement {
  const el = (tag: string, className: string, text?: string) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  const root = el('div', 'min-w-[200px] p-1 font-sans bg-surface text-content');
  root.append(
    el('h3', 'm-0 mb-2 text-base font-semibold text-content', info.name),
    el('p', 'm-0 mb-1 text-sm text-content-muted', info.city)
  );

  const rating = el('div', 'flex items-center gap-2 mt-2 text-sm');
  rating.append(
    el('span', 'text-warning', '★'),
    el('span', 'font-semibold text-content', info.rating),
    el('span', 'text-content-muted', `(${info.reviewsLabel})`)
  );
  root.append(rating);

  if (info.partnerLabel) {
    root.append(
      el(
        'span',
        'inline-block mt-2 px-2 py-1 rounded text-xs font-medium bg-[#00C9FF]/20 text-[#00C9FF] light:text-sky-800',
        info.partnerLabel
      )
    );
  }

  if (info.link) {
    const a = el(
      'a',
      'mt-3 flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 text-sm font-semibold text-white no-underline bg-section-gradient hover:opacity-90 focus-ring',
      info.link.label
    ) as HTMLAnchorElement;
    a.href = info.link.href;
    if (info.link.onClick) a.addEventListener('click', info.link.onClick);
    root.append(a);
  }

  return root;
}
