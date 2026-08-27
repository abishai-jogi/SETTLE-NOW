package com.settlenow.app.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "sync_state")
data class SyncStateEntity(
    @PrimaryKey @ColumnInfo(name = "entity_type") val entityType: String,
    @ColumnInfo(name = "last_pulled_at") val lastPulledAt: Long = 0L
)
