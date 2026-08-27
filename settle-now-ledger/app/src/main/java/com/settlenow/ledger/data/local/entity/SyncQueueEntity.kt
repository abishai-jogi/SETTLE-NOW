package com.settlenow.ledger.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "sync_queue",
    indices = [Index("entity_type", "entity_id")]
)
data class SyncQueueEntity(
    @PrimaryKey(autoGenerate = true) @ColumnInfo(name = "id") val id: Long = 0,
    @ColumnInfo(name = "entity_type") val entityType: String,
    @ColumnInfo(name = "entity_id") val entityId: String,
    @ColumnInfo(name = "operation") val operation: String,
    @ColumnInfo(name = "payload") val payload: String,
    @ColumnInfo(name = "created_at") val createdAt: Long,
    @ColumnInfo(name = "retry_count") val retryCount: Int = 0
)

object SyncEntityTypes {
    const val USER = "user"
    const val LEDGER = "ledger"
    const val LEDGER_MEMBER = "ledger_member"
    const val EXPENSE = "expense"
    const val EXPENSE_PARTICIPANT = "expense_participant"
    const val SETTLEMENT = "settlement"
}

object SyncOperations {
    const val CREATE = "create"
    const val UPDATE = "update"
    const val DELETE = "delete"
}
