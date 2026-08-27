package com.settlenow.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.settlenow.app.data.local.entity.SettlementEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface SettlementDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(settlement: SettlementEntity)

    @Query(
        "SELECT * FROM settlements WHERE room_id = :roomId AND is_deleted = 0 ORDER BY created_at DESC"
    )
    fun observeByRoom(roomId: String): Flow<List<SettlementEntity>>

    @Query("UPDATE settlements SET is_synced = 1 WHERE id IN (:ids)")
    suspend fun markSynced(ids: List<String>)
}
