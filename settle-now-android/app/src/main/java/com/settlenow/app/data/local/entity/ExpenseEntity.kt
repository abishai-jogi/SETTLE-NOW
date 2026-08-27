package com.settlenow.app.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

object SplitTypes {
    const val EQUAL = "EQUAL"
    const val CUSTOM = "CUSTOM"
    const val PERCENTAGE = "PERCENTAGE"
}

@Entity(tableName = "expenses")
data class ExpenseEntity(
    @PrimaryKey @ColumnInfo(name = "id") val id: String,
    @ColumnInfo(name = "room_id") val roomId: String,
    @ColumnInfo(name = "paid_by") val paidBy: String,
    @ColumnInfo(name = "amount_cents") val amountCents: Long,
    @ColumnInfo(name = "description") val description: String,
    @ColumnInfo(name = "split_type") val splitType: String,
    @ColumnInfo(name = "created_at") val createdAt: Long,
    @ColumnInfo(name = "updated_at") val updatedAt: Long,
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = false,
    @ColumnInfo(name = "is_deleted") val isDeleted: Boolean = false
)
