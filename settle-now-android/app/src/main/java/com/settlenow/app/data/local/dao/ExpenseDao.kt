package com.settlenow.app.data.local.dao

import androidx.room.Dao
import androidx.room.Embedded
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Relation
import androidx.room.Transaction
import com.settlenow.app.data.local.entity.ExpenseEntity
import com.settlenow.app.data.local.entity.ExpenseParticipantEntity
import kotlinx.coroutines.flow.Flow

data class ExpenseWithParticipants(
    @Embedded val expense: ExpenseEntity,
    @Relation(parentColumn = "id", entityColumn = "expense_id")
    val participants: List<ExpenseParticipantEntity>
)

@Dao
interface ExpenseDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(expense: ExpenseEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertParticipant(participant: ExpenseParticipantEntity)

    @Transaction
    suspend fun insertExpenseWithParticipants(
        expense: ExpenseEntity,
        participants: List<ExpenseParticipantEntity>
    ) {
        upsert(expense)
        participants.forEach { upsertParticipant(it) }
    }

    @Query("SELECT * FROM expenses WHERE id = :expenseId LIMIT 1")
    suspend fun byId(expenseId: String): ExpenseEntity?

    @Transaction
    @Query("SELECT * FROM expenses WHERE id = :expenseId LIMIT 1")
    suspend fun byIdWithParticipants(expenseId: String): ExpenseWithParticipants?

    @Transaction
    @Query(
        "SELECT * FROM expenses WHERE room_id = :roomId AND is_deleted = 0 ORDER BY created_at DESC"
    )
    fun observeByRoom(roomId: String): Flow<List<ExpenseWithParticipants>>

    @Query("UPDATE expenses SET is_synced = 1 WHERE id IN (:ids)")
    suspend fun markExpensesSynced(ids: List<String>)

    @Query("UPDATE expense_participants SET is_synced = 1 WHERE expense_id = :expenseId")
    suspend fun markParticipantsSynced(expenseId: String)
}
