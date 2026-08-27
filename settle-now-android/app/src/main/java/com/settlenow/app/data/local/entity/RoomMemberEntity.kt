package com.settlenow.app.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity

@Entity(
    tableName = "room_members",
    primaryKeys = ["room_id", "user_id"]
)
data class RoomMemberEntity(
    @ColumnInfo(name = "room_id") val roomId: String,
    @ColumnInfo(name = "user_id") val userId: String,
    @ColumnInfo(name = "joined_at") val joinedAt: Long,
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = false,
    @ColumnInfo(name = "is_deleted") val isDeleted: Boolean = false
)
