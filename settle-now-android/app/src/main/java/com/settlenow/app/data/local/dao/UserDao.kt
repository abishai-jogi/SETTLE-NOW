package com.settlenow.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.settlenow.app.data.local.entity.UserEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface UserDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(user: UserEntity)

    @Query("SELECT * FROM users WHERE id = :userId LIMIT 1")
    suspend fun byId(userId: String): UserEntity?

    @Query("SELECT * FROM users WHERE lower(name) = lower(:name) AND is_deleted = 0 LIMIT 1")
    suspend fun byName(name: String): UserEntity?

    @Query("SELECT color FROM users WHERE is_deleted = 0")
    suspend fun allColors(): List<String>

    @Query("SELECT * FROM users WHERE password_hash != '' AND is_deleted = 0 ORDER BY created_at ASC")
    suspend fun accountsOnce(): List<UserEntity>

    @Query("UPDATE users SET is_synced = 1 WHERE id IN (:ids)")
    suspend fun markSynced(ids: List<String>)

    @Query("SELECT * FROM users WHERE id IN (:ids)")
    suspend fun byIds(ids: List<String>): List<UserEntity>

    @Query(
        "SELECT u.* FROM users u INNER JOIN room_members rm ON rm.user_id = u.id " +
            "WHERE rm.room_id = :roomId AND rm.is_deleted = 0 AND u.is_deleted = 0 " +
            "ORDER BY rm.joined_at ASC"
    )
    fun observeRoomMembers(roomId: String): Flow<List<UserEntity>>

    @Query(
        "SELECT u.* FROM users u INNER JOIN room_members rm ON rm.user_id = u.id " +
            "WHERE rm.room_id = :roomId AND rm.is_deleted = 0 AND u.is_deleted = 0 " +
            "ORDER BY rm.joined_at ASC"
    )
    suspend fun roomMembersOnce(roomId: String): List<UserEntity>
}
