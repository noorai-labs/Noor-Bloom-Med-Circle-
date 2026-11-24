// @ts-check

/**
 * Rollout Reconciliation Guide:
 *
 * WHEN TO RUN:
 * Run this utility immediately after executing migration `0006_appointment_slots.sql`
 * during production rollout, prior to switching API traffic over to the updated Worker.
 *
 * HOW TO REVIEW:
 * 1. Execute: `node scripts/reconcile-appointments.cjs` (or invoke via migration pipeline).
 * 2. If `duplicates === 0`: All legacy appointments were cleanly indexed into appointment_slots.
 * 3. If `duplicates > 0`: Review the returned `details` array. Each entry identifies a
 *    legacy overlapping slot with both `primarySpace`/`primaryVisit` and
 *    `overlappingSpace`/`overlappingVisit`. Coordinate with clinical ops to reschedule
 *    or reassign the conflicting appointment before opening live booking traffic.
 *
 * @param {import("@cloudflare/workers-types").D1Database} db
 * @returns {Promise<{ reconciled: number, duplicates: number, details: Array<any> }>}
 */
async function reconcileAppointments(db) {
  const spaces = await db.prepare("SELECT id, state FROM care_spaces").all();
  let reconciled = 0;
  let duplicates = 0;
  const details = [];

  for (const row of spaces.results) {
    if (!row.state) continue;
    let state;
    try {
      state = typeof row.state === "string" ? JSON.parse(row.state) : row.state;
    } catch {
      continue;
    }

    const visits = Array.isArray(state?.visits) ? state.visits : [];
    for (const v of visits) {
      if (!v.id || !v.providerId || !v.date || !v.time || !v.status) continue;
      if (!["Requested", "Confirmed", "In Progress"].includes(v.status)) continue;

      const slotId = `slot_${row.id}_${v.id}`;
      // Check if slot already exists
      const existing = await db
        .prepare("SELECT id, space_id, visit_id FROM appointment_slots WHERE provider_id=? AND date=? AND time=? AND status IN ('Requested', 'Confirmed', 'In Progress')")
        .bind(v.providerId, v.date, v.time)
        .first();

      if (existing) {
        if (existing.space_id === row.id && existing.visit_id === v.id) {
          // Already properly tracked
          continue;
        }
        // Legacy overlapping active appointment detected!
        duplicates++;
        details.push({
          type: "legacy_overlap",
          providerId: v.providerId,
          date: v.date,
          time: v.time,
          primarySpace: existing.space_id,
          primaryVisit: existing.visit_id,
          overlappingSpace: row.id,
          overlappingVisit: v.id,
        });
      } else {
        await db
          .prepare("INSERT OR IGNORE INTO appointment_slots (id, provider_id, date, time, space_id, visit_id, status) VALUES (?,?,?,?,?,?,?)")
          .bind(slotId, v.providerId, v.date, v.time, row.id, v.id, v.status)
          .run();
        reconciled++;
      }
    }
  }

  return { reconciled, duplicates, details };
}

module.exports = { reconcileAppointments };

if (require.main === module) {
  console.log("Appointment reconciliation utility loaded.");
}
