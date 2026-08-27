package com.settlenow.ledger.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity

@Entity(
    tableName = "ledger_members",
    primaryKeys = ["ledger_id", "user_id"]
)
data class LedgerMemberEntity(
    @ColumnInfo(name = "ledger_id") val ledgerId: String,
    @ColumnInfo(name = "user_id") val userId: String,
    @ColumnInfo(name = "joined_at") val joinedAt: Long,
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = false,
    @ColumnInfo(name = "is_deleted") val isDeleted: Boolean = false
)
