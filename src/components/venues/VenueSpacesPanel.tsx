'use client';

import { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchVenueInstructorLinks, fetchVenueLocations, fetchVenueRooms, venueCall } from '@/lib/firebase/venueSpaces';
import { useManagedVenues } from '@/hooks/useManagedVenues';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/hooks/useI18n';
import { courseErrorMessage } from '@/lib/courseErrors';
import { Button } from '@/components/ui/button';
import type { VenueLocation, VenueRoom } from '@/types/venueSpaces';

const inputClass = 'w-full min-h-11 rounded-xl border border-hairline bg-surface p-3 text-content';
const DEFAULT_TIMEZONE = 'Europe/Rome';
const EMPTY_LOCATION = { name: '', address: '', city: '', timezone: DEFAULT_TIMEZONE };

type Space = { location: VenueLocation; rooms: VenueRoom[] };

function timezones(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  try { return supported ? supported('timeZone') : [DEFAULT_TIMEZONE]; } catch { return [DEFAULT_TIMEZONE]; }
}

/**
 * Locations and rooms of a venue that hosts courses, for its owner, its active staff and admins: add, deactivate and
 * reactivate them (saveGymSpace), and see the instructors an admin linked. A course takes its timezone from the
 * location and its lessons lock the room, so spaces are never deleted, only deactivated.
 */
export function VenueSpacesPanel({ venueId }: { venueId: string }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const { venues } = useManagedVenues();
  const allowed = role === 'admin' || role === 'superadmin' || venues.some((v) => v.id === venueId);
  const spaces = useQuery({
    queryKey: ['venueSpaces', venueId], enabled: allowed,
    queryFn: async (): Promise<Space[]> => {
      const locations = await fetchVenueLocations(venueId);
      return Promise.all(locations.map(async (location) => ({ location, rooms: await fetchVenueRooms(venueId, location.id) })));
    },
  });
  const links = useQuery({ queryKey: ['venueSpaces', venueId, 'instructors'], enabled: allowed,
    queryFn: () => fetchVenueInstructorLinks(venueId) });
  const [locationForm, setLocationForm] = useState(EMPTY_LOCATION);
  const [roomName, setRoomName] = useState('');
  const [roomLocation, setRoomLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const zoneList = useId();
  if (!allowed) return null;

  const list = spaces.data ?? [];
  const activeLocations = list.filter((space) => space.location.isActive);
  const chosen = activeLocations.find((space) => space.location.id === roomLocation) ?? activeLocations[0];

  async function save(data: Record<string, unknown>): Promise<boolean> {
    setBusy(true); setError('');
    try {
      await venueCall('saveGymSpace', data);
      await qc.invalidateQueries({ queryKey: ['venueSpaces', venueId] });
      return true;
    } catch (err) {
      setError(courseErrorMessage(err, t, locale));
      return false;
    } finally { setBusy(false); }
  }
  const toggleLocation = ({ id, name, address, city, timezone, isActive }: VenueLocation) =>
    save({ kind: 'location', venueId, id, name, address, city, timezone, isActive: !isActive });
  const toggleRoom = (locationId: string, { id, name, isActive }: VenueRoom) =>
    save({ kind: 'room', venueId, locationId, id, name, isActive: !isActive });

  const toggleButton = (active: boolean, name: string, onClick: () => void) => (
    <Button type="button" variant="secondary" size="sm" className="min-h-11 min-w-11" disabled={busy} onClick={onClick}
      aria-label={`${t(active ? 'venueSpaces.deactivate' : 'venueSpaces.activate')} ${name}`}>
      {t(active ? 'venueSpaces.deactivate' : 'venueSpaces.activate')}
    </Button>
  );
  const status = (active: boolean) => (
    <span className="rounded-full bg-content/10 px-2 py-0.5 text-xs font-medium text-content-muted">
      {t(active ? 'gym.active' : 'venueSpaces.inactive')}
    </span>
  );

  return <section id="spaces" className="space-y-4 rounded-xl border border-hairline bg-surface p-4">
    <h2 className="text-lg font-semibold">{t('venueSpaces.title')}</h2>
    {spaces.isSuccess && list.length === 0 && <p className="text-sm text-content-muted">{t('venueSpaces.empty')}</p>}
    <ul className="space-y-3">
      {list.map(({ location, rooms }) => <li key={location.id} className="space-y-2 rounded-xl border border-hairline p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium break-words">{location.name}</p>
            <p className="text-sm text-content-muted break-words">{location.address}, {location.city} · {location.timezone}</p>
          </div>
          <div className="flex items-center gap-2">
            {status(location.isActive)}
            {toggleButton(location.isActive, location.name, () => toggleLocation(location))}
          </div>
        </div>
        <ul className="space-y-1 border-t border-hairline pt-2">
          {rooms.map((room) => <li key={room.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="break-words">{room.name}</span>
            <span className="flex items-center gap-2">
              {status(room.isActive)}
              {toggleButton(room.isActive, room.name, () => toggleRoom(location.id, room))}
            </span>
          </li>)}
        </ul>
      </li>)}
    </ul>
    <div className="grid gap-4 md:grid-cols-2">
      <form aria-label={t('gym.addLocation')} className="space-y-3" onSubmit={async (event) => {
        event.preventDefault();
        if (await save({ kind: 'location', venueId, ...locationForm, isActive: true })) setLocationForm(EMPTY_LOCATION);
      }}>
        <h3 className="font-semibold">{t('gym.addLocation')}</h3>
        <label className="block space-y-1 text-sm">{t('gym.location')}<input className={inputClass} required minLength={2}
          value={locationForm.name} onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })} /></label>
        <label className="block space-y-1 text-sm">{t('gym.address')}<input className={inputClass} required minLength={2}
          value={locationForm.address} onChange={(e) => setLocationForm({ ...locationForm, address: e.target.value })} /></label>
        <label className="block space-y-1 text-sm">{t('gym.city')}<input className={inputClass} required minLength={2}
          value={locationForm.city} onChange={(e) => setLocationForm({ ...locationForm, city: e.target.value })} /></label>
        <label className="block space-y-1 text-sm">{t('gym.timezone')}<input className={inputClass} required list={zoneList}
          value={locationForm.timezone} onChange={(e) => setLocationForm({ ...locationForm, timezone: e.target.value })} /></label>
        <datalist id={zoneList}>{timezones().map((zone) => <option key={zone} value={zone} />)}</datalist>
        <Button type="submit" disabled={busy}>{t('gym.addLocation')}</Button>
      </form>
      <form aria-label={t('gym.addRoom')} className="space-y-3" onSubmit={async (event) => {
        event.preventDefault();
        if (chosen && await save({ kind: 'room', venueId, locationId: chosen.location.id, name: roomName, isActive: true })) setRoomName('');
      }}>
        <h3 className="font-semibold">{t('gym.addRoom')}</h3>
        <label className="block space-y-1 text-sm">{t('gym.chooseLocation')}
          <select className={inputClass} value={chosen?.location.id ?? ''} onChange={(e) => setRoomLocation(e.target.value)}>
            {activeLocations.map(({ location }) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select></label>
        <label className="block space-y-1 text-sm">{t('gym.room')}<input className={inputClass} required minLength={2}
          value={roomName} onChange={(e) => setRoomName(e.target.value)} /></label>
        <Button type="submit" disabled={busy || !chosen}>{t('gym.addRoom')}</Button>
      </form>
    </div>
    {!!links.data?.length && <div className="space-y-1 border-t border-hairline pt-3">
      <h3 className="font-semibold">{t('venueSpaces.instructors')}</h3>
      <ul className="text-sm">{links.data.map((link) => <li key={link.id}>
        {link.name} · {t(link.isActive ? 'gym.active' : 'venueSpaces.inactive')}
      </li>)}</ul>
    </div>}
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
  </section>;
}
