package com.settlenow.ledger.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import com.settlenow.ledger.data.local.entity.LedgerEntity
import com.settlenow.ledger.data.local.entity.LedgerMemberEntity
import kotlinx.coroutines.flow.Flow

data class LedgerWithMemberCount(
    val id: String,
    val name: String,
    val invite_code: String,
    val memberCount: Int,
    val created_at: Long
)

@Dao
interface LedgerDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(ledger: LedgerEntity)

    @Transaction
    suspend fun insertLedgerWithMembers(ledger: LedgerEntity, members: List<LedgerMemberEntity>) {
        upsert(ledger)
        members.forEach { insertMember(it) }
    }

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMember(member: LedgerMemberEntity)

    @Query("DELETE FROM ledger_members WHERE ledger_id = :ledgerId AND user_id = :userId")
    suspend fun deleteMember(ledgerId: String, userId: String)

    @Query(
        "SELECT l.id AS id, l.name AS name, l.invite_code AS invite_code, l.created_at AS created_at, " +
            "COUNT(m.user_id) AS memberCount " +
            "FROM ledgers l INNER JOIN ledger_members m ON m.ledger_id = l.id " +
            "WHERE l.is_deleted = 0 AND m.is_deleted = 0 AND m.user_id = :myUserId " +
            "GROUP BY l.id ORDER BY l.created_at DESC"
    )
    fun observeMyLedgers(myUserId: String): Flow<List<LedgerWithMemberCount>>

    @Query("SELECT * FROM ledgers WHERE id = :ledgerId AND is_deleted = 0 LIMIT 1")
    fun observeById(ledgerId: String): Flow<LedgerEntity?>

    @Query("SELECT * FROM ledgers WHERE invite_code = :code AND is_deleted = 0 LIMIT 1")
    suspend fun byInviteCode(code: String): LedgerEntity?

    @Query("SELECT COUNT(*) FROM ledger_members WHERE ledger_id = :ledgerId AND is_deleted = 0")
    suspend fun memberCount(ledgerId: String): Int

    @Query("UPDATE ledgers SET is_synced = 1 WHERE id IN (:ids)")
    suspend fun markLedgersSynced(ids: List<String>)

    @Query(
        "UPDATE ledger_members SET is_synced = 1 WHERE ledger_id || ':' || user_id IN (:compositeIds)"
    )
    suspend fun markMembersSynced(compositeIds: List<String>)
}
