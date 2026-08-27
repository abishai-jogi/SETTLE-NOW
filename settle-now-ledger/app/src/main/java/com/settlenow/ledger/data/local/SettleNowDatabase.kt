package com.settlenow.ledger.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.settlenow.ledger.data.local.dao.ConflictLogDao
import com.settlenow.ledger.data.local.dao.ExpenseDao
import com.settlenow.ledger.data.local.dao.LedgerDao
import com.settlenow.ledger.data.local.dao.SettlementDao
import com.settlenow.ledger.data.local.dao.SyncQueueDao
import com.settlenow.ledger.data.local.dao.SyncStateDao
import com.settlenow.ledger.data.local.dao.UserDao
import com.settlenow.ledger.data.local.entity.ConflictLogEntity
import com.settlenow.ledger.data.local.entity.ExpenseEntity
import com.settlenow.ledger.data.local.entity.ExpenseParticipantEntity
import com.settlenow.ledger.data.local.entity.LedgerEntity
import com.settlenow.ledger.data.local.entity.LedgerMemberEntity
import com.settlenow.ledger.data.local.entity.SettlementEntity
import com.settlenow.ledger.data.local.entity.SyncQueueEntity
import com.settlenow.ledger.data.local.entity.SyncStateEntity
import com.settlenow.ledger.data.local.entity.UserEntity

@Database(
    entities = [
        UserEntity::class,
        LedgerEntity::class,
        LedgerMemberEntity::class,
        ExpenseEntity::class,
        ExpenseParticipantEntity::class,
        SettlementEntity::class,
        SyncQueueEntity::class,
        SyncStateEntity::class,
        ConflictLogEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class SettleNowDatabase : RoomDatabase() {

    abstract fun userDao(): UserDao
    abstract fun ledgerDao(): LedgerDao
    abstract fun expenseDao(): ExpenseDao
    abstract fun settlementDao(): SettlementDao
    abstract fun syncQueueDao(): SyncQueueDao
    abstract fun syncStateDao(): SyncStateDao
    abstract fun conflictLogDao(): ConflictLogDao

    companion object {
        fun build(context: Context): SettleNowDatabase =
            Room.databaseBuilder(context, SettleNowDatabase::class.java, "settlenow.db")
                .fallbackToDestructiveMigration()
                .build()
    }
}
