package com.settlenow.ledger.data.repo

import androidx.room.withTransaction
import com.settlenow.ledger.data.local.SettleNowDatabase
import com.settlenow.ledger.data.local.dao.ExpenseWithParticipants
import com.settlenow.ledger.data.local.dao.LedgerWithMemberCount
import com.settlenow.ledger.data.local.entity.ExpenseEntity
import com.settlenow.ledger.data.local.entity.ExpenseParticipantEntity
import com.settlenow.ledger.data.local.entity.LedgerEntity
import com.settlenow.ledger.data.local.entity.LedgerMemberEntity
import com.settlenow.ledger.data.local.entity.SettlementEntity
import com.settlenow.ledger.data.local.entity.SyncEntityTypes
import com.settlenow.ledger.data.local.entity.SyncOperations
import com.settlenow.ledger.data.local.entity.SyncQueueEntity
import com.settlenow.ledger.data.local.entity.UserEntity
import com.settlenow.ledger.data.prefs.AppPrefs
import com.settlenow.ledger.domain.Balance
import com.settlenow.ledger.domain.BalanceCalculator
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import org.json.JSONObject
import java.security.SecureRandom

data class MemberInfo(
    val id: String,
    val name: String,
    val avatarInitials: String,
    val color: String,
    val isMe: Boolean
)

data class AverageRow(
    val member: MemberInfo,
    val monthlyCents: Long,
    val weeklyCents: Long
)

data class LedgerBalances(
    val members: List<MemberInfo>,
    val balances: List<Balance>,
    val transfers: List<com.settlenow.ledger.domain.Transfer>,
    val averages: List<AverageRow> = emptyList()
)

class SettleNowRepository(
    private val db: SettleNowDatabase,
    private val prefs: AppPrefs
) {

    private val userDao = db.userDao()
    private val ledgerDao = db.ledgerDao()
    private val expenseDao = db.expenseDao()
    private val settlementDao = db.settlementDao()
    private val syncQueueDao = db.syncQueueDao()
    private val conflictLogDao = db.conflictLogDao()

    // ---------- Auth ----------

    sealed interface SignupResult {
        data class Success(val user: UserEntity) : SignupResult
        data object NameTaken : SignupResult
        data object WeakPassword : SignupResult
    }

    suspend fun currentUserId(): String? {
        val id = prefs.userId ?: return null
        return userDao.byId(id)?.takeIf { it.passwordHash.isNotEmpty() }?.id
    }

    suspend fun currentUser(): UserEntity? = currentUserId()?.let { userDao.byId(it) }

    suspend fun signup(name: String, password: String): SignupResult {
        val clean = name.trim()
        if (password.length < 4) return SignupResult.WeakPassword
        if (clean.isEmpty()) return SignupResult.NameTaken
        if (userDao.byName(clean) != null) return SignupResult.NameTaken

        val salt = com.settlenow.ledger.domain.Passwords.makeSalt()
        val user = UserEntity(
            id = newId(),
            name = clean,
            avatarInitials = initialsOf(clean),
            color = com.settlenow.ledger.domain.ColorPicker.pick(userDao.allColors()),
            passwordHash = com.settlenow.ledger.domain.Passwords.hash(password, salt),
            salt = salt
        )
        db.withTransaction {
            userDao.upsert(user)
            enqueue(SyncEntityTypes.USER, user.id, SyncOperations.CREATE) { userPayload(user) }
        }
        prefs.userId = user.id
        return SignupResult.Success(user)
    }

    suspend fun login(name: String, password: String): UserEntity? {
        val account = userDao.byName(name.trim()) ?: return null
        if (!com.settlenow.ledger.domain.Passwords.verify(password, account.salt, account.passwordHash)) return null
        prefs.userId = account.id
        return account
    }

    fun logout() {
        prefs.userId = null
    }

    suspend fun myColorHex(): String = currentUser()?.color ?: "#7a1e2a"

    private fun JSONObject.userPayload(user: UserEntity) {
        put("id", user.id)
        put("name", user.name)
        put("avatar_initials", user.avatarInitials)
        put("color", user.color)
        put("password_hash", user.passwordHash)
        put("salt", user.salt)
        put("created_at", user.createdAt)
        put("updated_at", user.updatedAt)
        put("is_deleted", user.isDeleted)
    }

    // ---------- Ledgers ----------

    fun observeMyLedgers(): Flow<List<LedgerWithMemberCount>> =
        ledgerDao.observeMyLedgers(prefs.userId ?: "")

    suspend fun createLedger(ledgerName: String): String? {
        val me = currentUser() ?: return null
        val ledgerId = newId()
        val now = System.currentTimeMillis()
        val ledger = LedgerEntity(
            id = ledgerId,
            name = ledgerName.trim(),
            inviteCode = generateInviteCode(),
            createdBy = me.id,
            createdAt = now,
            updatedAt = now
        )
        val membership = LedgerMemberEntity(ledgerId = ledgerId, userId = me.id, joinedAt = now)

        db.withTransaction {
            ledgerDao.insertLedgerWithMembers(ledger, listOf(membership))
            enqueue(SyncEntityTypes.LEDGER, ledgerId, SyncOperations.CREATE) {
                put("id", ledger.id)
                put("name", ledger.name)
                put("invite_code", ledger.inviteCode)
                put("created_by", ledger.createdBy)
                put("created_at", ledger.createdAt)
                put("updated_at", ledger.updatedAt)
            }
            enqueueLedgerMember(membership)
        }
        return ledgerId
    }

    /**
     * Phase 1: joins against ledgers already known on this device.
     * Phase 2 replaces the lookup with the server-side invite check so
     * cross-device joining works — the UI flow stays identical.
     */
    sealed interface JoinOutcome {
        data class Success(val ledgerId: String, val ledgerName: String?) : JoinOutcome
        data object NotFound : JoinOutcome
        data object RoomFull : JoinOutcome
        data class Error(val message: String) : JoinOutcome
    }

    suspend fun joinLedgerByCode(rawCode: String): JoinOutcome {
        val uid = currentUserId() ?: return JoinOutcome.Error("Not signed in")
        val code = rawCode.trim().uppercase()

        val ledger = ledgerDao.byInviteCode(code) ?: return JoinOutcome.NotFound

        val members = userDao.ledgerMembersOnce(ledger.id)
        val alreadyMember = members.any { it.id == uid }
        if (!alreadyMember) {
            if (members.size >= 10) return JoinOutcome.RoomFull
            val membership = LedgerMemberEntity(
                ledgerId = ledger.id,
                userId = uid,
                joinedAt = System.currentTimeMillis()
            )
            db.withTransaction {
                ledgerDao.insertMember(membership)
                enqueueLedgerMember(membership)
            }
        }
        return JoinOutcome.Success(ledger.id, ledger.name)
    }

    fun observeLedger(ledgerId: String): Flow<LedgerEntity?> = ledgerDao.observeById(ledgerId)

    fun observeLedgerMembers(ledgerId: String): Flow<List<UserEntity>> =
        userDao.observeLedgerMembers(ledgerId)

    suspend fun addLocalMember(ledgerId: String, name: String): String {
        val trimmed = name.trim()
        val userId = newId()
        val user = UserEntity(
            id = userId,
            name = trimmed,
            avatarInitials = initialsOf(trimmed),
            color = com.settlenow.ledger.domain.ColorPicker.pick(userDao.allColors())
        )
        val membership = LedgerMemberEntity(
            ledgerId = ledgerId,
            userId = userId,
            joinedAt = System.currentTimeMillis()
        )
        db.withTransaction {
            userDao.upsert(user)
            ledgerDao.insertMember(membership)
            enqueue(SyncEntityTypes.USER, userId, SyncOperations.CREATE) { userPayload(user) }
            enqueueLedgerMember(membership)
        }
        return userId
    }

    suspend fun memberCount(ledgerId: String): Int = ledgerDao.memberCount(ledgerId)

    suspend fun ledgerMembersOnce(ledgerId: String): List<UserEntity> =
        userDao.ledgerMembersOnce(ledgerId)

    // ---------- Expenses ----------

    fun observeExpenses(ledgerId: String): Flow<List<ExpenseWithParticipants>> =
        expenseDao.observeByLedger(ledgerId)

    suspend fun addExpense(
        ledgerId: String,
        paidBy: String,
        description: String,
        amountCents: Long,
        splitType: String,
        shares: List<Pair<String, Long>>
    ): String? {
        require(shares.isNotEmpty()) { "expense needs at least one participant" }
        val expenseId = newId()
        val now = System.currentTimeMillis()
        val expense = ExpenseEntity(
            id = expenseId,
            ledgerId = ledgerId,
            paidBy = paidBy,
            amountCents = amountCents,
            description = description.trim(),
            splitType = splitType,
            createdAt = now,
            updatedAt = now
        )
        val participants = shares.map { (userId, shareCents) ->
            ExpenseParticipantEntity(
                expenseId = expenseId,
                userId = userId,
                shareCents = shareCents,
                updatedAt = now
            )
        }
        db.withTransaction {
            expenseDao.insertExpenseWithParticipants(expense, participants)
            enqueue(SyncEntityTypes.EXPENSE, expenseId, SyncOperations.CREATE) {
                put("id", expense.id)
                put("ledger_id", expense.ledgerId)
                put("paid_by", expense.paidBy)
                put("amount_cents", expense.amountCents)
                put("description", expense.description)
                put("split_type", expense.splitType)
                put("created_at", expense.createdAt)
                put("updated_at", expense.updatedAt)
                put("participant_ids", org.json.JSONArray(shares.map { it.first }.sorted()))
                val sharesArray = org.json.JSONArray()
                shares.sortedBy { it.first }.forEach { (userId, shareCents) ->
                    sharesArray.put(JSONObject().put("user_id", userId).put("share_cents", shareCents))
                }
                put("shares", sharesArray)
            }
        }
        return expenseId
    }

    // ---------- Settlements ----------

    suspend fun recordSettlement(
        ledgerId: String,
        fromUserId: String,
        toUserId: String,
        amountCents: Long
    ): String {
        val settlementId = newId()
        val now = System.currentTimeMillis()
        val settlement = SettlementEntity(
            id = settlementId,
            ledgerId = ledgerId,
            fromUser = fromUserId,
            toUser = toUserId,
            amountCents = amountCents,
            createdAt = now,
            updatedAt = now
        )
        db.withTransaction {
            settlementDao.upsert(settlement)
            enqueue(SyncEntityTypes.SETTLEMENT, settlementId, SyncOperations.CREATE) {
                put("id", settlement.id)
                put("ledger_id", settlement.ledgerId)
                put("from_user", settlement.fromUser)
                put("to_user", settlement.toUser)
                put("amount_cents", settlement.amountCents)
                put("created_at", settlement.createdAt)
                put("updated_at", settlement.updatedAt)
            }
        }
        return settlementId
    }

    // ---------- Balances ----------

    fun observeLedgerBalances(ledgerId: String): Flow<LedgerBalances> =
        combine(
            observeLedgerMembers(ledgerId),
            observeExpenses(ledgerId),
            settlementDao.observeByLedger(ledgerId)
        ) { members, expenses, settlements ->
            val net = BalanceCalculator.computeNetCents(expenses, settlements)
            val infos = members.map { m ->
                MemberInfo(m.id, m.name, m.avatarInitials, m.color, isMe = m.id == prefs.userId)
            }
            val balances = infos.mapNotNull { info -> net[info.id]?.let { Balance(info.id, it) } }

            val now = System.currentTimeMillis()
            val weekCut = now - 7L * 24 * 60 * 60 * 1000
            val monthCut = now - 30L * 24 * 60 * 60 * 1000
            val live = expenses.filter { !it.expense.isDeleted }
            fun paidCents(id: String, cut: Long): Long =
                live.filter { it.expense.paidBy == id && it.expense.createdAt >= cut }
                    .sumOf { it.expense.amountCents }

            val averages = infos.map { info ->
                AverageRow(
                    member = info,
                    monthlyCents = paidCents(info.id, monthCut),
                    weeklyCents = paidCents(info.id, weekCut)
                )
            }.sortedByDescending { it.monthlyCents }

            LedgerBalances(
                members = infos,
                balances = balances,
                transfers = com.settlenow.ledger.domain.DebtSimplifier.simplify(net),
                averages = averages
            )
        }

    fun observePendingSyncCount(): Flow<Int> = syncQueueDao.observePendingCount()

    fun observeConflictCount(): Flow<Int> = conflictLogDao.observeCount()

    // ---------- Helpers ----------

    private suspend fun enqueueLedgerMember(member: LedgerMemberEntity) {
        enqueue(SyncEntityTypes.LEDGER_MEMBER, "${member.ledgerId}:${member.userId}", SyncOperations.CREATE) {
            put("ledger_id", member.ledgerId)
            put("user_id", member.userId)
            put("joined_at", member.joinedAt)
        }
    }

    private suspend fun enqueue(
        entityType: String,
        entityId: String,
        operation: String,
        payload: JSONObject.() -> Unit
    ) {
        val json = JSONObject().apply(payload)
        syncQueueDao.enqueue(
            SyncQueueEntity(
                entityType = entityType,
                entityId = entityId,
                operation = operation,
                payload = json.toString(),
                createdAt = System.currentTimeMillis()
            )
        )
    }

    companion object {
        private const val CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
        private val random = SecureRandom()

        fun newId(): String = java.util.UUID.randomUUID().toString()

        fun initialsOf(name: String): String =
            name.trim().split(Regex("\\s+"))
                .filter { it.isNotBlank() }
                .take(2)
                .mapNotNull { it.firstOrNull()?.uppercaseChar() }
                .joinToString("")
                .ifEmpty { "?" }

        fun generateInviteCode(length: Int = 6): String =
            buildString {
                repeat(length) { append(CODE_ALPHABET[random.nextInt(CODE_ALPHABET.length)]) }
            }
    }
}
