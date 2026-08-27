package com.settlenow.firebase.data.repo

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldPath
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.MetadataChanges
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.DocumentSnapshot
import com.settlenow.firebase.data.model.Expense
import com.settlenow.firebase.data.model.LedgerEntry
import com.settlenow.firebase.data.model.LedgerFilter
import com.settlenow.firebase.data.model.ParticipantShare
import com.settlenow.firebase.data.model.Room
import com.settlenow.firebase.data.model.Settlement
import com.settlenow.firebase.data.model.UserDoc
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.tasks.await
import java.security.SecureRandom
import java.util.Calendar

sealed interface JoinOutcome {
    data class Success(val roomId: String, val roomName: String?) : JoinOutcome
    data object NotFound : JoinOutcome
    data object RoomFull : JoinOutcome
    data class Error(val message: String) : JoinOutcome
}

class FirebaseRepository(
    private val auth: FirebaseAuth,
    private val fs: FirebaseFirestore
) {

    private val currentUserId: String? get() = auth.currentUser?.uid

    private fun userRef(uid: String) = fs.collection("users").document(uid)
    private fun roomRef(roomId: String) = fs.collection("rooms").document(roomId)
    private fun membersCol(roomId: String) = roomRef(roomId).collection("members")
    private fun expensesCol(roomId: String) = roomRef(roomId).collection("expenses")
    private fun settlementsCol(roomId: String) = roomRef(roomId).collection("settlements")

    companion object {
        private const val CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
        private val random = SecureRandom()

        fun generateInviteCode(length: Int = 6): String =
            buildString {
                repeat(length) { append(CODE_ALPHABET[random.nextInt(CODE_ALPHABET.length)]) }
            }

        fun initialsOf(name: String): String =
            name.trim().split(Regex("\\s+"))
                .filter { it.isNotBlank() }
                .take(2)
                .mapNotNull { it.firstOrNull()?.uppercaseChar() }
                .joinToString("")
                .ifEmpty { "?" }
    }

    // ---------- user ----------

    fun observeCurrentUser(): Flow<UserDoc?> = callbackFlow {
        val uid = currentUserId
        if (uid == null) {
            trySend(null)
            awaitClose { }
            return@callbackFlow
        }
        val registration = userRef(uid).addSnapshotListener { snap, error ->
            if (error != null) {
                close(error)
                return@addSnapshotListener
            }
            trySend(snap?.toUserDoc(uid))
        }
        awaitClose { registration.remove() }
    }

    suspend fun ensureUserDoc(): UserDoc? {
        val uid = currentUserId ?: return null
        val snap = userRef(uid).get().await()
        if (!snap.exists()) {
            userRef(uid).set(
                mapOf(
                    "name" to "",
                    "avatar_initials" to "?",
                    "phone" to (auth.currentUser?.phoneNumber ?: ""),
                    "rooms" to emptyList<String>()
                )
            ).await()
            return UserDoc(id = uid, name = "", avatarInitials = "?", rooms = emptyList())
        }
        return snap.toUserDoc(uid)
    }

    suspend fun saveUserName(name: String) {
        val uid = currentUserId ?: return
        val trimmed = name.trim()
        if (trimmed.isEmpty()) return
        userRef(uid)
            .update("name", trimmed, "avatar_initials", initialsOf(trimmed))
            .await()
    }

    private fun DocumentSnapshot.toUserDoc(fallbackId: String) = UserDoc(
        id = if (id.isBlank()) fallbackId else id,
        name = getString("name") ?: "",
        avatarInitials = getString("avatar_initials") ?: "?",
        rooms = (get("rooms") as? List<*>)?.filterIsInstance<String>() ?: emptyList()
    )

    // ---------- rooms ----------

    fun observeMyRooms(): Flow<List<Room>> =
        observeCurrentUser().flatMapLatest { user -> observeRooms(user?.rooms ?: emptyList()) }

    private fun observeRooms(roomIds: List<String>): Flow<List<Room>> {
        val distinct = roomIds.distinct()
        if (distinct.isEmpty()) return flowOf(emptyList())
        val chunkFlows = distinct.chunked(10).map { chunk ->
            callbackFlow {
                val registration = fs.collection("rooms")
                    .whereIn(FieldPath.documentId(), chunk)
                    .addSnapshotListener { snap, error ->
                        if (error != null) {
                            close(error)
                            return@addSnapshotListener
                        }
                        trySend((snap?.documents ?: emptyList()).mapNotNull { it.toRoom() })
                    }
                awaitClose { registration.remove() }
            }
        }
        return combine(chunkFlows) { arrays -> arrays.flatten().sortedByDescending { it.createdAtMs ?: 0L } }
    }

    fun observeRoom(roomId: String): Flow<Room?> = callbackFlow {
        val registration = roomRef(roomId).addSnapshotListener { snap, error ->
            if (error != null) {
                close(error)
                return@addSnapshotListener
            }
            trySend(snap?.toRoom())
        }
        awaitClose { registration.remove() }
    }

    private fun DocumentSnapshot.toRoom() = Room(
        id = id,
        name = getString("name") ?: "",
        inviteCode = getString("invite_code") ?: "",
        createdBy = getString("created_by") ?: "",
        createdAtMs = getTimestamp("created_at")?.toDate()?.time
    )

    suspend fun createRoom(roomName: String): String? {
        val uid = currentUserId ?: return null
        val me = ensureUserDoc()
        val roomId = fs.collection("rooms").document().id
        val code = generateInviteCode()

        val batch = fs.batch()
        batch.set(
            roomRef(roomId),
            mapOf(
                "name" to roomName.trim(),
                "invite_code" to code,
                "created_by" to uid,
                "created_at" to FieldValue.serverTimestamp()
            )
        )
        batch.set(
            membersCol(roomId).document(uid),
            mapOf(
                "user_id" to uid,
                "name" to (me?.name ?: ""),
                "joined_at" to FieldValue.serverTimestamp()
            )
        )
        batch.set(fs.collection("invites").document(code), mapOf("room_id" to roomId))
        batch.update(userRef(uid), "rooms", FieldValue.arrayUnion(roomId))
        batch.commit().await()
        return roomId
    }

    suspend fun joinRoomByCode(rawCode: String): JoinOutcome {
        val uid = currentUserId ?: return JoinOutcome.Error("Not signed in")
        val code = rawCode.trim().uppercase()

        val invite = try {
            fs.collection("invites").document(code).get().await()
        } catch (_: Exception) {
            return JoinOutcome.Error("Can't reach the server — check connection.")
        }
        if (!invite.exists()) return JoinOutcome.NotFound
        val roomId = invite.getString("room_id") ?: return JoinOutcome.NotFound

        val membersSnap = try {
            membersCol(roomId).get().await()
        } catch (_: Exception) {
            return JoinOutcome.Error("Can't reach the server — check connection.")
        }
        val alreadyMember = membersSnap.documents.any { it.id == uid }
        if (!alreadyMember && membersSnap.size() >= 10) return JoinOutcome.RoomFull

        val me = ensureUserDoc()
        if (!alreadyMember) {
            val batch = fs.batch()
            batch.set(
                membersCol(roomId).document(uid),
                mapOf(
                    "user_id" to uid,
                    "name" to (me?.name ?: ""),
                    "joined_at" to FieldValue.serverTimestamp()
                )
            )
            batch.update(userRef(uid), "rooms", FieldValue.arrayUnion(roomId))
            batch.commit().await()
        }

        val roomName = try {
            roomRef(roomId).get().await().getString("name")
        } catch (_: Exception) {
            null
        }
        return JoinOutcome.Success(roomId, roomName)
    }

    suspend fun leaveRoom(roomId: String): Boolean {
        val uid = currentUserId ?: return false
        val batch = fs.batch()
        batch.delete(membersCol(roomId).document(uid))
        batch.update(userRef(uid), "rooms", FieldValue.arrayRemove(roomId))
        batch.commit().await()
        return true
    }

    // ---------- members / expenses / settlements ----------

    fun observeMembers(roomId: String): Flow<List<com.settlenow.firebase.data.model.Member>> = callbackFlow {
        val registration = membersCol(roomId)
            .orderBy("joined_at", Query.Direction.ASCENDING)
            .addSnapshotListener { snap, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                trySend((snap?.documents ?: emptyList()).mapNotNull { it.toMember() })
            }
        awaitClose { registration.remove() }
    }

    private fun DocumentSnapshot.toMember() = Member(
        userId = getString("user_id") ?: id,
        name = getString("name") ?: "",
        joinedAtMs = getTimestamp("joined_at")?.toDate()?.time
    )

    fun observeExpenses(roomId: String): Flow<List<Expense>> = callbackFlow {
        val registration = expensesCol(roomId)
            .orderBy("created_at", Query.Direction.DESCENDING)
            .limit(300)
            .addSnapshotListener(MetadataChanges.INCLUDE) { snap, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                trySend(
                    (snap?.documents ?: emptyList()).mapNotNull { doc ->
                        doc.toExpense(isPending = doc.metadata.hasPendingWrites())
                    }
                )
            }
        awaitClose { registration.remove() }
    }

    fun observeSettlements(roomId: String): Flow<List<Settlement>> = callbackFlow {
        val registration = settlementsCol(roomId)
            .orderBy("created_at", Query.Direction.DESCENDING)
            .limit(200)
            .addSnapshotListener(MetadataChanges.INCLUDE) { snap, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                trySend(
                    (snap?.documents ?: emptyList()).mapNotNull { doc ->
                        doc.toSettlement(isPending = doc.metadata.hasPendingWrites())
                    }
                )
            }
        awaitClose { registration.remove() }
    }

    suspend fun getExpenseOnce(roomId: String, expenseId: String): Expense? =
        expensesCol(roomId).document(expenseId).get().await().toExpense(false)

    suspend fun roomMembersOnce(roomId: String): List<com.settlenow.firebase.data.model.Member> =
        membersCol(roomId)
            .orderBy("joined_at", Query.Direction.ASCENDING)
            .get().await()
            .documents.mapNotNull { it.toMember() }

    private fun DocumentSnapshot.toExpense(isPending: Boolean): Expense? = try {
        Expense(
            id = id,
            paidBy = getString("paid_by") ?: "",
            description = getString("description") ?: "",
            amountCents = getLong("amount_cents") ?: 0L,
            splitType = getString("split_type") ?: "equal",
            participants = (get("participants") as? List<*>)?.mapNotNull { raw ->
                (raw as? Map<*, *>)?.let { map ->
                    val userId = map["user_id"] as? String ?: return@mapNotNull null
                    val cents = (map["share_cents"] as? Number)?.toLong() ?: 0L
                    ParticipantShare(userId, cents)
                }
            } ?: emptyList(),
            createdAtMs = getTimestamp("created_at")?.toDate()?.time,
            isDeleted = getBoolean("is_deleted") ?: false,
            supersededBy = getString("superseded_by"),
            isPending = isPending
        )
    } catch (_: Exception) {
        null
    }

    private fun DocumentSnapshot.toSettlement(isPending: Boolean) = Settlement(
        id = id,
        fromUserId = getString("from_user") ?: "",
        toUserId = getString("to_user") ?: "",
        amountCents = getLong("amount_cents") ?: 0L,
        createdAtMs = getTimestamp("created_at")?.toDate()?.time,
        isPending = isPending
    )

    /**
     * Adds an immutable expense event. When [supersedes] is set (the edit flow),
     * the old document is flagged in the same atomic batch and linked via
     * superseded_by — history is never rewritten.
     */
    suspend fun addExpense(
        roomId: String,
        paidBy: String,
        description: String,
        amountCents: Long,
        splitType: String,
        shares: List<Pair<String, Long>>,
        supersedes: String? = null
    ): String? {
        val newExpenseId = fs.collection("rooms").document().collection("expenses").document().id
        val data = mapOf(
            "paid_by" to paidBy,
            "amount_cents" to amountCents,
            "description" to description.trim(),
            "split_type" to splitType,
            "participants" to shares.sortedBy { it.first }.map { (userId, shareCents) ->
                mapOf("user_id" to userId, "share_cents" to shareCents)
            },
            "created_at" to FieldValue.serverTimestamp(),
            "is_deleted" to false,
            "superseded_by" to null
        )
        if (supersedes == null) {
            expensesCol(roomId).document(newExpenseId).set(data).await()
        } else {
            val batch = fs.batch()
            batch.set(expensesCol(roomId).document(newExpenseId), data)
            batch.update(
                expensesCol(roomId).document(supersedes),
                mapOf("is_deleted" to true, "superseded_by" to newExpenseId)
            )
            batch.commit().await()
        }
        return newExpenseId
    }

    suspend fun recordSettlement(
        roomId: String,
        fromUserId: String,
        toUserId: String,
        amountCents: Long
    ): String? {
        val uid = currentUserId ?: return null
        val settlementRef = settlementsCol(roomId).document()
        settlementRef.set(
            mapOf(
                "from_user" to uid,
                "to_user" to toUserId,
                "amount_cents" to amountCents,
                "created_at" to FieldValue.serverTimestamp()
            )
        ).await()
        return settlementRef.id
    }

    // ---------- ledger (derived view) ----------

    fun buildLedger(
        expenses: List<Expense>,
        settlements: List<Settlement>,
        filter: LedgerFilter
    ): List<LedgerEntry> {
        val entries = mutableListOf<LedgerEntry>()
        for (expense in expenses) {
            if (expense.isDeleted || expense.supersededBy != null) continue
            entries.add(LedgerEntry.ExpenseEntry(expense))
        }
        for (settlement in settlements) {
            entries.add(LedgerEntry.SettlementEntry(settlement))
        }
        val cutoffMs = when (filter.range) {
            com.settlenow.firebase.data.model.LedgerRange.ALL -> Long.MIN_VALUE
            com.settlenow.firebase.data.model.LedgerRange.WEEK ->
                System.currentTimeMillis() - 7L * 24 * 60 * 60 * 1000
            com.settlenow.firebase.data.model.LedgerRange.MONTH -> {
                val calendar = Calendar.getInstance()
                calendar.set(Calendar.DAY_OF_MONTH, 1)
                calendar.set(Calendar.HOUR_OF_DAY, 0)
                calendar.set(Calendar.MINUTE, 0)
                calendar.set(Calendar.SECOND, 0)
                calendar.set(Calendar.MILLISECOND, 0)
                calendar.timeInMillis
            }
        }
        return entries
            .asSequence()
            .filter { it.sortKeyMs >= cutoffMs }
            .filter { entry ->
                val memberId = filter.memberId ?: return@filter true
                when (entry) {
                    is LedgerEntry.ExpenseEntry -> entry.expense.paidBy == memberId ||
                        entry.expense.participants.any { it.userId == memberId }
                    is LedgerEntry.SettlementEntry -> entry.settlement.fromUserId == memberId ||
                        entry.settlement.toUserId == memberId
                }
            }
            .sortedBy { it.sortKeyMs }
            .toList()
    }
}
