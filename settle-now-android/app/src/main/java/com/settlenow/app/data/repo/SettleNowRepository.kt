package com.settlenow.app.data.repo

import androidx.room.withTransaction
import com.settlenow.app.data.local.SettleNowDatabase
import com.settlenow.app.data.local.dao.ExpenseWithParticipants
import com.settlenow.app.data.local.dao.RoomWithMemberCount
import com.settlenow.app.data.local.entity.ExpenseEntity
import com.settlenow.app.data.local.entity.ExpenseParticipantEntity
import com.settlenow.app.data.local.entity.RoomEntity
import com.settlenow.app.data.local.entity.RoomMemberEntity
import com.settlenow.app.data.local.entity.SyncEntityTypes
import com.settlenow.app.data.local.entity.SyncOperations
import com.settlenow.app.data.local.entity.SyncQueueEntity
import com.settlenow.app.data.local.entity.UserEntity
import com.settlenow.app.data.prefs.AppPrefs
import com.settlenow.app.domain.Balance
import com.settlenow.app.domain.BalanceCalculator
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
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

data class RoomBalances(
    val members: List<MemberInfo>,
    val balances: List<Balance>,
    val transfers: List<com.settlenow.app.domain.Transfer>,
    val averages: List<AverageRow> = emptyList()
)

class SettleNowRepository(
    private val db: SettleNowDatabase,
    private val prefs: AppPrefs
) {

    private val userDao = db.userDao()
    private val roomDao = db.roomDao()
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

        val salt = com.settlenow.app.domain.Passwords.makeSalt()
        val user = UserEntity(
            id = newId(),
            name = clean,
            avatarInitials = initialsOf(clean),
            color = com.settlenow.app.domain.ColorPicker.pick(userDao.allColors()),
            passwordHash = com.settlenow.app.domain.Passwords.hash(password, salt),
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
        if (!com.settlenow.app.domain.Passwords.verify(password, account.salt, account.passwordHash)) return null
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

    // ---------- Rooms ----------

    fun observeMyRooms(): Flow<List<RoomWithMemberCount>> =
        roomDao.observeMyRooms(prefs.userId ?: "")

    suspend fun createRoom(roomName: String): String? {
        val me = currentUser() ?: return null
        val roomId = newId()
        val now = System.currentTimeMillis()
        val room = RoomEntity(
            id = roomId,
            name = roomName.trim(),
            inviteCode = generateInviteCode(),
            createdBy = me.id,
            createdAt = now,
            updatedAt = now
        )
        val membership = RoomMemberEntity(roomId = roomId, userId = me.id, joinedAt = now)

        db.withTransaction {
            roomDao.insertRoomWithMembers(room, listOf(membership))
            enqueue(SyncEntityTypes.ROOM, roomId, SyncOperations.CREATE) {
                put("id", room.id)
                put("name", room.name)
                put("invite_code", room.inviteCode)
                put("created_by", room.createdBy)
                put("created_at", room.createdAt)
                put("updated_at", room.updatedAt)
            }
            enqueueRoomMember(membership)
        }
        return roomId
    }

    fun observeRoom(roomId: String): Flow<RoomEntity?> = roomDao.observeById(roomId)

    fun observeRoomMembers(roomId: String): Flow<List<UserEntity>> =
        userDao.observeRoomMembers(roomId)

    suspend fun addLocalMember(roomId: String, name: String): String {
        val trimmed = name.trim()
        val userId = newId()
        val user = UserEntity(
            id = userId,
            name = trimmed,
            avatarInitials = initialsOf(trimmed),
            color = com.settlenow.app.domain.Palette.firstFree(userDao.allColors())
        )
        val membership = RoomMemberEntity(
            roomId = roomId,
            userId = userId,
            joinedAt = System.currentTimeMillis()
        )
        db.withTransaction {
            userDao.upsert(user)
            roomDao.insertMember(membership)
            enqueue(SyncEntityTypes.USER, userId, SyncOperations.CREATE) { userPayload(user) }
            enqueueRoomMember(membership)
        }
        return userId
    }

    suspend fun memberCount(roomId: String): Int = roomDao.memberCount(roomId)

    suspend fun roomMembersOnce(roomId: String): List<UserEntity> =
        userDao.roomMembersOnce(roomId)

    // ---------- Expenses ----------

    fun observeExpenses(roomId: String): Flow<List<ExpenseWithParticipants>> =
        expenseDao.observeByRoom(roomId)

    /**
     * Adds an immutable expense event with explicit per-user shares. Shares are
     * computed upstream (equal/custom/percentage) using deterministic integer
     * cent math so every offline device agrees to the cent.
     */
    suspend fun addExpense(
        roomId: String,
        paidBy: String,
        description: String,
        amountCents: Long,
        splitType: String,
        shares: List<Pair<String, Long>>
    ): String {
        require(shares.isNotEmpty()) { "expense needs at least one participant" }
        val expenseId = newId()
        val now = System.currentTimeMillis()
        val expense = ExpenseEntity(
            id = expenseId,
            roomId = roomId,
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
                put("room_id", expense.roomId)
                put("paid_by", expense.paidBy)
                put("amount_cents", expense.amountCents)
                put("description", expense.description)
                put("split_type", expense.splitType)
                put("created_at", expense.createdAt)
                put("updated_at", expense.updatedAt)
                put("participant_ids", org.json.JSONArray(shares.map { it.first }.sorted()))
                val sharesArray = org.json.JSONArray()
                shares.sortedBy { it.first }.forEach { (userId, shareCents) ->
                    sharesArray.put(
                        JSONObject().put("user_id", userId).put("share_cents", shareCents)
                    )
                }
                put("shares", sharesArray)
            }
        }
        return expenseId
    }

    /** Records a settlement event: fromUser pays toUser, clearing that debt slice. */
    suspend fun recordSettlement(
        roomId: String,
        fromUserId: String,
        toUserId: String,
        amountCents: Long
    ): String {
        val settlementId = newId()
        val now = System.currentTimeMillis()
        val settlement = SettlementEntity(
            id = settlementId,
            roomId = roomId,
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
                put("room_id", settlement.roomId)
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

    fun observeRoomBalances(roomId: String): Flow<RoomBalances> =
        combine(
            observeRoomMembers(roomId),
            observeExpenses(roomId),
            settlementDao.observeByRoom(roomId)
        ) { members, expenses, settlements ->
            val net = BalanceCalculator.computeNetCents(expenses, settlements)
            val balances = members.mapNotNull { m -> net[m.id]?.let { Balance(m.id, it) } }
            val infos = members.map { m ->
                MemberInfo(m.id, m.name, m.avatarInitials, m.color, isMe = m.id == prefs.userId)
            }

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

            RoomBalances(
                members = infos,
                balances = balances,
                transfers = com.settlenow.app.domain.DebtSimplifier.simplify(net),
                averages = averages
            )
        }

    fun observePendingSyncCount(): Flow<Int> = syncQueueDao.observePendingCount()

    fun observeConflictCount(): Flow<Int> = conflictLogDao.observeCount()

    suspend fun pendingSyncCountOnce(): Int = syncQueueDao.all().size

    // ---------- Helpers ----------

    private suspend fun enqueueRoomMember(member: RoomMemberEntity) {
        enqueue(SyncEntityTypes.ROOM_MEMBER, "${member.roomId}:${member.userId}", SyncOperations.CREATE) {
            put("room_id", member.roomId)
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
