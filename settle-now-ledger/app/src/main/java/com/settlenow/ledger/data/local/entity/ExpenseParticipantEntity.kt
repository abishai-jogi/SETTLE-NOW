package com.settlenow.ledger.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index

@Entity(
    tableName = "expense_participants",
    primaryKeys = ["expense_id", "user_id"],
    indices = [Index("expense_id"), Index("user_id")]
)
data class ExpenseParticipantEntity(
    @ColumnInfo(name = "expense_id") val expenseId: String,
    @ColumnInfo(name = "user_id") val userId: String,
    @ColumnInfo(name = "share_cents") val shareCents: Long,
    @ColumnInfo(name = "share_percentage") val sharePercentage: Double = 0.0,
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = false,
    @ColumnInfo(name = "is_deleted") val isDeleted: Boolean = false,
    @ColumnInfo(name = "updated_at") val updatedAt: Long = System.currentTimeMillis()
)
