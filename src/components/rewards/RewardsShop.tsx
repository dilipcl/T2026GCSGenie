import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { RewardItem, RewardRedemption, UserRole } from '../../types';
import { calculateTotalXP } from '../../services/ragCalculator';
import { logAuditEvent } from '../../services/auditService';
import {
  Gift,
  Sparkles,
  ShieldAlert,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { newId } from '../../utils/id';
import { useFeedback } from '../shared/FeedbackProvider';

interface RewardsShopProps {
  currentRole: UserRole;
}

export const RewardsShop: React.FC<RewardsShopProps> = ({ currentRole }) => {
  const { toast, confirm } = useFeedback();
  /**
   * Live queries, so the balance can never be stale: a request made two seconds
   * ago is already reflected in the affordability check for the next one, and a
   * parent approving on another screen updates this one without a reload.
   */
  // Retired rewards stay in the table so old redemptions still resolve, but
  // they are off the shelf.
  const rewards =
    useLiveQuery(async () => (await db.rewards.toArray()).filter((r) => !r.isArchived), []) ?? [];
  const redemptions =
    useLiveQuery(() => db.redemptions.orderBy('requestedAt').reverse().toArray(), []) ?? [];
  const xpLedger = useLiveQuery(() => calculateTotalXP(), []);

  /** Which reward has a request in flight - the double-tap guard. */
  const [busyRewardId, setBusyRewardId] = useState<string | null>(null);

  if (!xpLedger) return null;
  const xpData = xpLedger;

  const handleRequestRedemption = async (item: RewardItem) => {
    if (busyRewardId) return;
    if (xpData.isShopFrozen) {
      toast.error(
        'Rewards are frozen',
        'A school sanction is active. Complete the remediation quest a parent set to unlock the shop.'
      );
      return;
    }

    if (xpData.availableXP < item.costXP) {
      toast.error(
        `Not enough XP for "${item.title}"`,
        `It costs ${item.costXP.toLocaleString()} XP and you have ${xpData.availableXP.toLocaleString()} XP to spend` +
          (xpData.reservedXP > 0
            ? `, with ${xpData.reservedXP.toLocaleString()} XP held against requests awaiting approval.`
            : '.')
      );
      return;
    }

    const ok = await confirm({
      title: `Request "${item.title}"?`,
      body: `${item.costXP.toLocaleString()} XP is held from your balance until a parent approves or denies it. You can withdraw the request to get it back.`,
      confirmLabel: 'Request it',
    });
    if (!ok) return;

    setBusyRewardId(item.id);
    try {
    const redemption: RewardRedemption = {
      id: newId('red'),
      rewardId: item.id,
      rewardTitle: item.title,
      costXP: item.costXP,
      requestedAt: Date.now(),
      status: 'PENDING',
    };

    await db.redemptions.add(redemption);
    await logAuditEvent({
      user: 'STUDENT',
      action: 'REWARD_REDEEM',
      entity: 'RewardRedemption',
      entityId: redemption.id,
      newValue: `Requested: ${item.title} (-${item.costXP} XP, Status: PENDING)`,
    });

    toast.celebrate(
      `Requested "${item.title}"`,
      `${item.costXP.toLocaleString()} XP is held until a parent approves it.`
    );
    } finally {
      setBusyRewardId(null);
    }
  };

  /**
   * The pressure-release valve for a mis-tap: a pending request can be taken
   * back by the student, returning the held XP. Only PENDING requests reserve
   * anything, so flipping the status is the entire refund.
   */
  const handleWithdraw = async (redemption: RewardRedemption) => {
    const ok = await confirm({
      title: `Withdraw "${redemption.rewardTitle}"?`,
      body: `The ${redemption.costXP.toLocaleString()} XP being held goes straight back to your balance.`,
      confirmLabel: 'Withdraw',
    });
    if (!ok) return;

    await db.redemptions.update(redemption.id, { status: 'WITHDRAWN', resolvedAt: Date.now() });
    await logAuditEvent({
      user: 'STUDENT',
      action: 'UPDATE',
      entity: 'RewardRedemption',
      entityId: redemption.id,
      fieldChanged: 'status',
      oldValue: 'PENDING',
      newValue: `WITHDRAWN by student (${redemption.costXP} XP hold released)`,
    });
    toast.info(`Withdrew "${redemption.rewardTitle}"`, 'The held XP is back in your balance.');
  };

  const handleParentResolve = async (
    redemption: RewardRedemption,
    status: 'APPROVED' | 'DENIED'
  ) => {
    // Pending requests already reserve their cost, so approving one is normally
    // balance-neutral. This guard catches redemptions logged before reservation
    // existed, which could still take the balance negative.
    if (status === 'APPROVED') {
      const earnedAfterPenalties = xpData.totalXP - xpData.penaltyXP;
      if (earnedAfterPenalties - xpData.redeemedXP - redemption.costXP < 0) {
        const over = Math.abs(earnedAfterPenalties - xpData.redeemedXP - redemption.costXP);
        toast.error(
          `That would overdraw the balance by ${over.toLocaleString()} XP`,
          `Earned after penalties ${earnedAfterPenalties.toLocaleString()} XP, already redeemed ${xpData.redeemedXP.toLocaleString()} XP, this request ${redemption.costXP.toLocaleString()} XP. Deny it, or wait until more XP has been earned.`
        );
        return;
      }
    }

    await db.redemptions.update(redemption.id, {
      status,
      resolvedAt: Date.now(),
    });

    await logAuditEvent({
      user: 'PARENT',
      action: 'UPDATE',
      entity: 'RewardRedemption',
      entityId: redemption.id,
      fieldChanged: 'status',
      oldValue: 'PENDING',
      newValue: status,
    });

    if (status === 'APPROVED') {
      toast.celebrate(`Approved "${redemption.rewardTitle}"`, `${redemption.costXP.toLocaleString()} XP spent.`);
    } else {
      toast.info(`Denied "${redemption.rewardTitle}"`, 'The held XP has been returned.');
    }
  };

  // Cheapest reward not yet affordable - the one worth aiming at right now
  const nextReward = [...rewards]
    .filter((r) => r.costXP > xpData.availableXP)
    .sort((a, b) => a.costXP - b.costXP)[0];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="glass-card p-6 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border-indigo-500/30 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              🎁
            </span>
            <h2 className="text-xl font-bold text-white">Rewards</h2>
          </div>
          <p className="text-xs text-slate-300 max-w-xl">
            Spend the XP you've earned from check-ins, homework and fix-ups. Requests go to your
            parents to approve.
          </p>
        </div>

        <div className="flex items-center gap-4 bg-slate-900/90 px-5 py-3 rounded-2xl border border-slate-800">
          <div>
            <span className="block text-[10px] uppercase font-bold text-slate-400">
              XP you can spend
            </span>
            <span className="text-xl font-extrabold text-indigo-400">
              {xpData.availableXP.toLocaleString()} XP
            </span>
            {xpData.reservedXP > 0 && (
              <span className="block text-[10px] text-amber-300 font-semibold mt-0.5">
                {xpData.reservedXP.toLocaleString()} XP held for requests awaiting approval
              </span>
            )}
          </div>
          <Sparkles className="w-8 h-8 text-amber-400" />
        </div>
      </div>

      {/* Anticipation does more work than the balance alone: show the next thing
          within reach and how close it is */}
      {nextReward && (
        <div className="glass-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <p className="text-xs text-slate-300">
              <span className="text-lg mr-1.5">{nextReward.icon}</span>
              Next up: <strong className="text-white">{nextReward.title}</strong>
            </p>
            <span className="text-xs font-bold text-amber-400">
              {(nextReward.costXP - xpData.availableXP).toLocaleString()} XP to go
            </span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/60">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-amber-400 transition-all duration-500"
              style={{
                width: `${Math.min(100, (xpData.availableXP / nextReward.costXP) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Detention Freeze Alert Banner */}
      {xpData.isShopFrozen && (
        <div className="p-4 bg-rose-950/40 rounded-2xl border border-rose-500/60 text-xs text-rose-200 flex items-start gap-3">
          <ShieldAlert className="w-6 h-6 text-rose-400 flex-shrink-0" />
          <div>
            <h4 className="font-bold text-rose-300 text-sm">REWARDS SHOP FROZEN</h4>
            <p className="mt-0.5">
              A school detention or sanction has been logged (-500 XP). All reward redemptions are
              locked until a parent-assigned academic remediation quest is completed and approved.
            </p>
          </div>
        </div>
      )}

      {/* Reward Items Catalog */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-2">
          <Gift className="w-4 h-4 text-indigo-400" />
          <span>What you can spend XP on</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Cheapest first, so what is actually within reach leads */}
          {[...rewards]
            .sort((a, b) => a.costXP - b.costXP)
            .map((item) => {
            const canAfford = xpData.availableXP >= item.costXP && !xpData.isShopFrozen;
            return (
              <div
                key={item.id}
                className="glass-card p-5 flex flex-col justify-between transition-all hover:border-slate-700"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl p-2 bg-slate-800/80 rounded-xl border border-slate-700">
                      {item.icon}
                    </span>
                    <span className="text-xs font-bold text-amber-400 bg-amber-950/60 px-2.5 py-1 rounded-lg border border-amber-800/60">
                      {item.costXP.toLocaleString()} XP
                    </span>
                  </div>

                  <h4 className="font-bold text-sm text-white mb-1">{item.title}</h4>
                  <p className="text-xs text-slate-400 mb-4">{item.description}</p>
                </div>

                <button
                  onClick={() => handleRequestRedemption(item)}
                  disabled={!canAfford || busyRewardId !== null}
                  className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                    canAfford
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-950/50 active:scale-98'
                      : 'bg-slate-800/50 text-slate-500 cursor-not-allowed border border-slate-800'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Request Redemption</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>


      {/* Redemptions Ledger */}
      <div className="glass-card p-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-400" />
          <span>Your requests</span>
        </h3>

        {redemptions.length === 0 ? (
          <p className="text-xs text-slate-500 italic p-3 text-center">
            No reward redemptions requested yet.
          </p>
        ) : (
          <div className="space-y-2.5">
            {redemptions.map((red) => (
              <div
                key={red.id}
                className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-xs text-white">{red.rewardTitle}</h4>
                    <span
                      className={`text-[10px] px-2 py-0.2 rounded font-bold uppercase ${
                        red.status === 'APPROVED'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : red.status === 'DENIED'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : red.status === 'WITHDRAWN'
                          ? 'bg-slate-700/40 text-slate-400 border border-slate-600/50'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {red.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Requested on {new Date(red.requestedAt).toLocaleDateString('en-GB')} · Cost: {red.costXP} XP
                  </p>
                </div>

                {/* Parent Approval Buttons (If in Parent Mode & Pending) */}
                {currentRole === 'PARENT' && red.status === 'PENDING' ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleParentResolve(red, 'APPROVED')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow-md shadow-emerald-950/40"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approve</span>
                    </button>
                    <button
                      onClick={() => handleParentResolve(red, 'DENIED')}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1 shadow-md shadow-rose-950/40"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Deny</span>
                    </button>
                  </div>
                ) : red.status === 'PENDING' ? (
                  <button
                    onClick={() => handleWithdraw(red)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1 transition-all"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Withdraw</span>
                  </button>
                ) : (
                  <span className="text-xs font-mono text-slate-400 font-semibold">
                    {red.status === 'WITHDRAWN' ? '0 XP' : `-${red.costXP} XP`}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
