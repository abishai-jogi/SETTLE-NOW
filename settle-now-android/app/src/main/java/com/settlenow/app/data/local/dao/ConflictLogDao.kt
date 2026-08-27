package com.settlenow.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import com.settlenow.app.data.local.entity.ConflictLogEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ConflictLogDao {

    @Insert
    suspend fun insert(entry: ConflictLogEntity)

    @Query("SELECT * FROM conflict_log ORDER BY detected_at DESC")
    fun observeAll(): Flow<List<ConflictLogEntity>>

    @Query("SELECT COUNT(*) FROM conflict_log")
    fun observeCount(): Flow<Int>

    @Query("DELETE FROM conflict_log")
    suspend fun clear()
}
