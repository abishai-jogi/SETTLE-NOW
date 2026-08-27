package com.settlenow.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import com.settlenow.app.data.local.entity.RoomEntity
import com.settlenow.app.data.local.entity.RoomMemberEntity
import kotlinx.coroutines.flow.Flow

data class RoomWithMemberCount(
    val id: String,
    val name: String,
    val invite_code: String,
    val memberCount: Int,
    val created_at: Long
)

@Dao
interface RoomDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(room: RoomEntity)

    @Transaction
    suspend fun insertRoomWithMembers(room: RoomEntity, members: List<RoomMemberEntity>) {
        upsert(room)
        members.forEach { insertMember(it) }
    }

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMember(member: RoomMemberEntity)

    @Query(
        "SELECT r.id AS id, r.name AS name, r.invite_code AS invite_code, r.created_at AS created_at, " +
            "COUNT(m.user_id) AS memberCount " +
            "FROM rooms r INNER JOIN room_members m ON m.room_id = r.id " +
            "WHERE r.is_deleted = 0 AND m.is_deleted = 0 AND m.user_id = :myUserId " +
            "GROUP BY r.id ORDER BY r.created_at DESC"
    )
    fun observeMyRooms(myUserId: String): Flow<List<RoomWithMemberCount>>

    @Query("SELECT * FROM rooms WHERE id = :roomId AND is_deleted = 0 LIMIT 1")
    fun observeById(roomId: String): Flow<RoomEntity?>

    @Query("SELECT COUNT(*) FROM room_members WHERE room_id = :roomId AND is_deleted = 0")
    suspend fun memberCount(roomId: String): Int

    @Query("UPDATE rooms SET is_synced = 1 WHERE id IN (:ids)")
    suspend fun markRoomsSynced(ids: List<String>)

    @Query(
        "UPDATE room_members SET is_synced = 1 WHERE room_id || ':' || user_id IN (:compositeIds)"
    )
    suspend fun markMembersSynced(compositeIds: List<String>): Int
}
