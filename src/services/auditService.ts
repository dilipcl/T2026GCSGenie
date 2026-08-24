import { db } from '../db';
import { AuditLogEntry, UserRole } from '../types';
import { sha256 } from '../utils/hash';
import { newId } from '../utils/id';

export async function logAuditEvent(params: {
  user: UserRole;
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'AGENT_AUDIT' | 'SANCTION_FREEZE' | 'REWARD_REDEEM';
  entity: string;
  entityId: string;
  fieldChanged?: string;
  oldValue?: string;
  newValue?: string;
}): Promise<AuditLogEntry> {
  const timestamp = Date.now();
  const rawPayload = `${timestamp}|${params.user}|${params.action}|${params.entity}|${params.entityId}|${params.fieldChanged || ''}|${params.oldValue || ''}|${params.newValue || ''}`;
  const hash = await sha256(rawPayload);

  const entry: AuditLogEntry = {
    id: newId('audit'),
    timestamp,
    user: params.user,
    action: params.action,
    entity: params.entity,
    entityId: params.entityId,
    fieldChanged: params.fieldChanged,
    oldValue: params.oldValue,
    newValue: params.newValue,
    hash,
  };

  await db.auditLogs.add(entry);
  return entry;
}
