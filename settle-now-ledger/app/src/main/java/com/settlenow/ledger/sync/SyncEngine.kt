package com.settlenow.ledger.sync

import androidx.room.withTransaction
import com.settlenow.ledger.data.local.SettleNowDatabase
import com.settlenow.ledger.data.local.entity.ConflictLogEntity
import com.settlenow.ledger.data.local.entity.ConflictSources
import com.settlenow.ledger.data.local.entity.ExpenseEntity
import com.settlenow.ledger.data.local.entity.ExpenseParticipantEntity
import com.settlenow.ledger.data.local.entity.LedgerEntity
import com.settlenow.ledger.data.local.entity.LedgerMemberEntity
import com.settlenow.ledger.data.local.entity.SettlementEntity
import com.settlenow.ledger.data.local.entity.SyncStateEntity
import com.settlenow.ledger.data.local.entity.UserEntity
import com.settlenow.ledger.data.prefs.AppPrefs
import com.settlenow.ledger.data.remote.SyncApi
import org.json.JSONArray
import org.json.JSONObject

/**
 * Drains the outbox (push), then pulls remote changes newer than the stored
 * cursors. Pure local-DB + HTTP; never blocks UI writes.
 *
 * Conflict policy: last-write-wins on updated_at. Losing versions survive in
 * the device-local conflict_log (and server-side conflict_log) instead of
 * being silently discarded.
 */
class SyncEngine(
    private val db: SettleNowDatabase,
    private val prefs: AppPrefs,
    private val api: SyncApi
) {

    suspend fun syncNow(): Boolean {
        return try {
            pushOutbox()
            pull()
            true
        } catch (_: Exception) {
            false
        }
    }

    // ---------- push ----------

    private suspend fun pushOutbox() {
        while (true) {
            val batch = db.syncQueueDao().all().take(50)
            if (batch.isEmpty()) return

            val operations = JSONArray()
            for (entry in batch) {
                operations.put(
                    JSONObject()
                        .put("entity_type", entry.entityType)
                        .put("entity_id", entry.entityId)
                        .put("operation", entry.operation)
                        .put("payload", JSONObject(entry.payload))
                )
            }

            val body = JSONObject().put("operations", operations).toString()
            val responseText = api.push(body) ?: throw SyncException("push failed")
            val response = JSONObject(responseText)

            val results = response.optJSONArray("results") ?: JSONArray()
            val appliedByType = HashMap<String, MutableList<String>>()
            var hadServerErrors = false

            for (i in 0 until results.length()) {
                val result = results.getJSONObject(i)
                val queueEntry = batch.getOrNull(i) ?: continue
                when (result.optString("status")) {
                    "applied" -> {
                        appliedByType.getOrPut(result.getString("entity_type")) { mutableListOf() }
                            .add(result.getString("entity_id"))
                    }
                    "conflict_lww" -> recordPushConflict(
                        queueEntry.payload,
                        queueEntry.entityType,
                        queueEntry.entityId,
                        result.optLong("winner_updated_at")
                    )
                    else -> hadServerErrors = true
                }
            }

            markLocalSynced(appliedByType)
            if (hadServerErrors) return
            db.syncQueueDao().deleteProcessed(batch.map { it.id })

            if (batch.size < 50) return
        }
    }

    private suspend fun recordPushConflict(
        losingPayloadJson: String,
        entityType: String,
        entityId: String,
        winnerUpdatedAt: Long
    ) {
        val losingUpdatedAt = runCatching { JSONObject(losingPayloadJson).getLong("updated_at") }.getOrNull()
        db.conflictLogDao().insert(
            ConflictLogEntity(
                entityType = entityType,
                entityId = entityId,
                source = ConflictSources.PUSH,
                losingPayload = losingPayloadJson,
                losingUpdatedAt = losingUpdatedAt,
                winnerUpdatedAt = winnerUpdatedAt.takeIf { it > 0 },
                detectedAt = System.currentTimeMillis()
            )
        )
    }

    private suspend fun markLocalSynced(applied: Map<String, List<String>>) {
        applied["user"]?.let { if (it.isNotEmpty()) db.userDao().markSynced(it) }
        applied["ledger"]?.let { if (it.isNotEmpty()) db.ledgerDao().markLedgersSynced(it) }
        applied["ledger_member"]?.let { if (it.isNotEmpty()) db.ledgerDao().markMembersSynced(it) }
        applied["expense"]?.forEach { expenseId ->
            db.expenseDao().markExpensesSynced(listOf(expenseId))
            db.expenseDao().markParticipantsSynced(expenseId)
        }
        applied["settlement"]?.let { if (it.isNotEmpty()) db.settlementDao().markSynced(it) }
    }

    // ---------- pull ----------

    private suspend fun pull() {
        val myUserId = prefs.userId ?: return

        val cursors = JSONObject()
        PULL_TYPES.forEach { type ->
            cursors.put(type, db.syncStateDao().byType(type)?.lastPulledAt ?: 0L)
        }

        val request = JSONObject()
            .put("my_user_id", myUserId)
            .put("cursors", cursors)

        val responseText = api.pull(request.toString()) ?: throw SyncException("pull failed")
        val response = JSONObject(responseText)

        applyPull(response.getJSONObject("changes"))
        advanceCursors(response.getLong("server_time_ms"))
    }

    private suspend fun applyPull(changes: JSONObject) {
        db.withTransaction {
            changes.optJSONArray("users")?.forEachObj { obj ->
                db.userDao().upsert(
                    UserEntity(
                        id = obj.getString("id"),
                        name = obj.getString("name"),
                        avatarInitials = obj.optString("avatar_initials", "?"),
                        color = obj.optString("color", "#3a3733"),
                        passwordHash = obj.optString("password_hash", ""),
                        salt = obj.optString("salt", ""),
                        createdAt = obj.optLong("created_at"),
                        updatedAt = obj.getLong("updated_at"),
                        isSynced = true,
                        isDeleted = obj.getBoolean("is_deleted")
                    )
                )
            }

            changes.optJSONArray("ledgers")?.forEachObj { obj ->
                db.ledgerDao().upsert(
                    LedgerEntity(
                        id = obj.getString("id"),
                        name = obj.getString("name"),
                        inviteCode = obj.getString("invite_code"),
                        createdBy = obj.getString("created_by"),
                        createdAt = obj.getLong("created_at"),
                        updatedAt = obj.getLong("updated_at"),
                        isSynced = true,
                        isDeleted = obj.getBoolean("is_deleted")
                    )
                )
            }

            changes.optJSONArray("ledger_members")?.forEachObj { obj ->
                db.ledgerDao().insertMember(
                    LedgerMemberEntity(
                        ledgerId = obj.getString("ledger_id"),
                        userId = obj.getString("user_id"),
                        joinedAt = obj.getLong("joined_at"),
                        isSynced = true,
                        isDeleted = obj.getBoolean("is_deleted")
                    )
                )
            }

            changes.optJSONArray("expenses")?.forEachObj { obj ->
                val incomingUpdatedAt = obj.getLong("updated_at")
                val local = db.expenseDao().byId(obj.getString("id"))

                if (local != null && !local.isSynced && local.updatedAt > incomingUpdatedAt) {
                    // Local edit wins; keep it queued for the next push and preserve the stale remote version.
                    db.conflictLogDao().insert(
                        ConflictLogEntity(
                            entityType = "expense",
                            entityId = local.id,
                            source = ConflictSources.PULL,
                            losingPayload = obj.toString(),
                            losingUpdatedAt = incomingUpdatedAt,
                            winnerUpdatedAt = local.updatedAt,
                            detectedAt = System.currentTimeMillis()
                        )
                    )
                    return@forEachObj
                }
                db.expenseDao().upsert(
                    ExpenseEntity(
                        id = obj.getString("id"),
                        ledgerId = obj.getString("ledger_id"),
                        paidBy = obj.getString("paid_by"),
                        amountCents = obj.getLong("amount_cents"),
                        description = obj.optString("description", ""),
                        splitType = obj.optString("split_type", "EQUAL"),
                        createdAt = obj.getLong("created_at"),
                        updatedAt = incomingUpdatedAt,
                        isSynced = true,
                        isDeleted = obj.getBoolean("is_deleted")
                    )
                )
            }

            changes.optJSONArray("expense_participants")?.forEachObj { obj ->
                db.expenseDao().upsertParticipant(
                    ExpenseParticipantEntity(
                        expenseId = obj.getString("expense_id"),
                        userId = obj.getString("user_id"),
                        shareCents = obj.getLong("share_cents"),
                        updatedAt = obj.getLong("updated_at"),
                        isSynced = true,
                        isDeleted = obj.getBoolean("is_deleted")
                    )
                )
            }

            changes.optJSONArray("settlements")?.forEachObj { obj ->
                db.settlementDao().upsert(
                    SettlementEntity(
                        id = obj.getString("id"),
                        ledgerId = obj.getString("ledger_id"),
                        fromUser = obj.getString("from_user"),
                        toUser = obj.getString("to_user"),
                        amountCents = obj.getLong("amount_cents"),
                        createdAt = obj.getLong("created_at"),
                        updatedAt = obj.getLong("updated_at"),
                        isSynced = true,
                        isDeleted = obj.getBoolean("is_deleted")
                    )
                )
            }
        }
    }

    private suspend fun advanceCursors(serverTimeMs: Long) {
        PULL_TYPES.forEach { type ->
            db.syncStateDao().upsert(SyncStateEntity(entityType = type, lastPulledAt = serverTimeMs))
        }
    }

    private companion object {
        val PULL_TYPES = listOf(
            "users",
            "ledgers",
            "ledger_members",
            "expenses",
            "expense_participants",
            "settlements"
        )
    }

    private class SyncException(message: String) : RuntimeException(message)
}

private inline fun JSONArray.forEachObj(action: (JSONObject) -> Unit) {
    for (i in 0 until length()) action(getJSONObject(i))
}
