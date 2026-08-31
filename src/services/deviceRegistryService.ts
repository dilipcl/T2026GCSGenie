import { db } from '../db';
import { DeviceRegistration, UserRole } from '../types';
import { getDeviceId } from '../utils/device';

/**
 * Putting a name to the uuid on every audit row.
 *
 * The activity feed's whole premise is that you can see who did something. The
 * audit log has recorded a `deviceId` since v5 and a `UserRole` since the
 * beginning, and neither is a person: role stops distinguishing anyone the
 * moment two parents use the app, and a uuid distinguishes everything and means
 * nothing.
 *
 * Naming the device is the cheapest honest answer. It needs no separate cloud
 * logins, it works offline, and because the id is already on the historic rows
 * the names apply retroactively - which is the only reason the 27 entries
 * written before any of this existed can be attributed at all.
 *
 * What it is not: identification of a human. Two people on one laptop are one
 * device, and the UI must say "Dad's laptop", never "Dad". Anywhere that
 * distinction could mislead, `describeActor` spells it out.
 */

/** Labels a device is given before anyone has typed a real one. */
function provisionalLabel(role: UserRole, seenAt: number): string {
  const when = new Date(seenAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
  const who =
    role === 'STUDENT' ? 'Student device' : role === 'PARENT' ? 'Parent device' : 'Automated';
  return `${who} (first seen ${when})`;
}

/**
 * Records that this device exists and has just been used.
 *
 * Called on app start. Deliberately does not overwrite a label somebody typed -
 * only `lastSeenAt` moves - because a device that gets renamed and then reopened
 * would otherwise revert to its provisional name.
 */
export async function touchThisDevice(role: UserRole): Promise<DeviceRegistration> {
  const id = getDeviceId();
  const now = Date.now();
  const existing = await db.deviceRegistry.get(id);

  if (existing) {
    await db.deviceRegistry.update(id, { lastSeenAt: now });
    return { ...existing, lastSeenAt: now };
  }

  const created: DeviceRegistration = {
    id,
    label: provisionalLabel(role, now),
    usualRole: role,
    firstSeenAt: now,
    lastSeenAt: now,
    isProvisional: true,
  };
  await db.deviceRegistry.add(created);
  return created;
}

/** Renames a device. The one place `isProvisional` is cleared. */
export async function nameDevice(
  deviceId: string,
  label: string,
  ownerName?: string
): Promise<void> {
  const trimmed = label.trim();
  if (!trimmed) return;
  await db.deviceRegistry.update(deviceId, {
    label: trimmed,
    ownerName: ownerName?.trim() || undefined,
    isProvisional: false,
  });
}

/** Assigns a device to a person without touching its label. */
export async function claimDevice(deviceId: string, ownerName: string): Promise<void> {
  const trimmed = ownerName.trim();
  await db.deviceRegistry.update(deviceId, { ownerName: trimmed || undefined });
}

/**
 * Everyone who has claimed at least one device, with the devices they use.
 *
 * Drives the "who" filter. Sorted by most recently active, so the person who
 * just did something is at the front rather than whoever was registered first.
 */
export interface Person {
  name: string;
  deviceIds: string[];
  lastSeenAt: number;
}

export async function people(): Promise<Person[]> {
  const devices = await reconcileDevicesFromAuditLog();
  const byName = new Map<string, Person>();

  for (const device of devices) {
    if (!device.ownerName) continue;
    const existing = byName.get(device.ownerName);
    if (existing) {
      existing.deviceIds.push(device.id);
      existing.lastSeenAt = Math.max(existing.lastSeenAt, device.lastSeenAt);
    } else {
      byName.set(device.ownerName, {
        name: device.ownerName,
        deviceIds: [device.id],
        lastSeenAt: device.lastSeenAt,
      });
    }
  }

  return [...byName.values()].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

export async function setDeviceRole(deviceId: string, usualRole: UserRole): Promise<void> {
  await db.deviceRegistry.update(deviceId, { usualRole });
}

/**
 * Every device the audit log has ever seen, named where possible.
 *
 * Registrations only exist for devices that have opened the app since v12, but
 * the log goes back further - so any id appearing in `auditLogs` with no
 * registration gets one synthesised here rather than rendering as a raw uuid.
 * The synthesised rows are written back, so labelling them sticks.
 */
export async function reconcileDevicesFromAuditLog(): Promise<DeviceRegistration[]> {
  const [logs, registered] = await Promise.all([
    db.auditLogs.toArray(),
    db.deviceRegistry.toArray(),
  ]);

  const known = new Set(registered.map((d) => d.id));
  const unseen = new Map<string, { role: UserRole; first: number; last: number }>();

  for (const entry of logs) {
    if (!entry.deviceId || known.has(entry.deviceId)) continue;
    const current = unseen.get(entry.deviceId);
    if (!current) {
      unseen.set(entry.deviceId, {
        role: entry.user,
        first: entry.timestamp,
        last: entry.timestamp,
      });
      continue;
    }
    current.first = Math.min(current.first, entry.timestamp);
    current.last = Math.max(current.last, entry.timestamp);
    /**
     * A device that has ever written a PARENT row is a parent device. Tejas's
     * phone never enters parent mode, and a laptop used for both should read as
     * the more capable of the two rather than flipping with whichever row came
     * last.
     */
    if (entry.user === 'PARENT') current.role = 'PARENT';
  }

  const created: DeviceRegistration[] = [];
  for (const [id, info] of unseen) {
    const row: DeviceRegistration = {
      id,
      label: provisionalLabel(info.role, info.first),
      usualRole: info.role,
      firstSeenAt: info.first,
      lastSeenAt: info.last,
      isProvisional: true,
    };
    created.push(row);
  }

  /**
   * `bulkPut`, not `bulkAdd`, because this runs concurrently.
   *
   * The activity feed resolves device labels and loads comments in the same
   * `Promise.all`, and both paths reconcile. With `bulkAdd` the second one hit
   * a ConstraintError on a row the first had just written, which surfaced as the
   * whole feed failing to load - triggered by nothing more exotic than someone
   * leaving a comment. Writing the same synthesised row twice is harmless;
   * refusing to is not.
   */
  if (created.length) await db.deviceRegistry.bulkPut(created);
  return [...registered, ...created].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

export async function allDevices(): Promise<DeviceRegistration[]> {
  return (await db.deviceRegistry.toArray()).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

/** id -> label, for rendering a feed without a lookup per row. */
export async function deviceLabelMap(): Promise<Map<string, DeviceRegistration>> {
  const rows = await reconcileDevicesFromAuditLog();
  return new Map(rows.map((d) => [d.id, d]));
}

const ROLE_FALLBACK: Record<UserRole, string> = {
  STUDENT: 'Student',
  PARENT: 'Parent',
  SYSTEM_AGENT: 'Genie (automatic)',
};

/**
 * What to print in the "who" column.
 *
 * Falls back to the role when a row predates device ids entirely - which is
 * true of the two oldest entries in this database and will be true of anything
 * restored from an old backup.
 */
export function describeActor(
  role: UserRole,
  deviceId: string | undefined,
  devices: Map<string, DeviceRegistration>
): { label: string; person?: string } {
  if (!deviceId) return { label: ROLE_FALLBACK[role] };
  const device = devices.get(deviceId);
  if (!device) return { label: ROLE_FALLBACK[role] };
  return { label: device.label, person: device.ownerName };
}

/**
 * True when nobody has named or claimed this device yet, so the UI can prompt
 * once.
 *
 * Claiming matters as much as naming: a device with a good label and no owner
 * still cannot be grouped with that person's other devices.
 */
export async function needsNaming(): Promise<boolean> {
  const row = await db.deviceRegistry.get(getDeviceId());
  return !row || row.isProvisional === true || !row.ownerName;
}
