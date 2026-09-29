// Pure helpers for scripts/notify-missing-location.mjs (tested in missingLocation.test.mjs).

/** Fixed id: the notification is one-time, so a second run finds it and skips the user. */
export const NOTIFICATION_ID = "d4-missing-location";
export const LINK = "/provider/location";

export const MESSAGES = {
  it: {
    title: "Aggiungi la tua posizione",
    body: "Aggiungi la tua posizione per comparire nelle ricerche vicino a te: bastano pochi secondi.",
  },
  en: {
    title: "Add your location",
    body: "Add your location to show up in \"near me\" searches — it takes a few seconds.",
  },
  es: {
    title: "Añade tu ubicación",
    body: "Añade tu ubicación para aparecer en las búsquedas cerca de ti: solo lleva unos segundos.",
  },
  fr: {
    title: "Ajoutez votre localisation",
    body: "Ajoutez votre localisation pour apparaître dans les recherches à proximité : cela ne prend que quelques secondes.",
  },
  de: {
    title: "Standort hinzufügen",
    body: "Fügen Sie Ihren Standort hinzu, um in der Umkreissuche zu erscheinen – das dauert nur wenige Sekunden.",
  },
};

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Same test as the app's needsLocation(): flat numeric lat/lng, not (0, 0). */
export function hasCoordinates(data) {
  return isNum(data.lat) && isNum(data.lng) && !(data.lat === 0 && data.lng === 0);
}

/**
 * Whether this instructor doc belongs to a real provider account that should be nudged:
 * not an activity/catalog entry, no coordinates, and a users/{id} doc of someone in the
 * provider area (providerStatus pending/verified, or legacy role 'provider').
 */
export function shouldNotify(instructor, user) {
  if (!instructor || !user) return false;
  if (instructor.activityKind) return false;
  if (hasCoordinates(instructor)) return false;
  return (
    user.providerStatus === "verified" ||
    user.providerStatus === "pending" ||
    user.role === "provider"
  );
}

/** The users/{uid}/notifications doc, in the shape functions/src/bookings/notify.ts writes. */
export function buildNotification(preferredLanguage, createdAt) {
  const m = MESSAGES[preferredLanguage] ?? MESSAGES.it;
  return {
    title: m.title,
    body: m.body,
    type: "system",
    data: { link: LINK },
    imageUrl: null,
    isRead: false,
    createdAt,
  };
}
