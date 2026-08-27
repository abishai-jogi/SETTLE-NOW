package com.settlenow.firebase.data.model

data class UserDoc(
    val id: String,
    val name: String,
    val avatarInitials: String,
    val rooms: List<String>
)

data class Room(
    val id: String,
    val name: String,
    val inviteCode: String,
    val createdBy: String,
    val createdAtMs: Long?
)

data class Member(
    val userId: String,
    val name: String,
    val joinedAtMs: Long?
)

data class ParticipantShare(
    val userId: String,
    val shareCents: Long
)

data class Expense(
    val id: String,
    val paidBy: String,
    val description: String,
    val amountCents: Long,
    val splitType: String,
    val participants: List<ParticipantShare>,
    val createdAtMs: Long?,
    val isDeleted: Boolean = false,
    val supersededBy: String? = null,
    val isPending: Boolean = false
)

data class Settlement(
    val id: String,
    val fromUserId: String,
    val toUserId: String,
    val amountCents: Long,
    val createdAtMs: Long?,
    val isPending: Boolean = false
)

sealed interface LedgerEntry {
    val sortKeyMs: Long

    data class ExpenseEntry(val expense: Expense) : LedgerEntry {
        override val sortKeyMs: Long get() = expense.createdAtMs ?: Long.MAX_VALUE
    }

    data class SettlementEntry(val settlement: Settlement) : LedgerEntry {
        override val sortKeyMs: Long get() = settlement.createdAtMs ?: Long.MAX_VALUE
    }
}

enum class LedgerRange { ALL, WEEK, MONTH }

data class LedgerFilter(
    val memberId: String? = null,
    val range: LedgerRange = LedgerRange.ALL
)
