package com.settlenow.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.settlenow.app.data.local.dao.ConflictLogDao
import com.settlenow.app.data.local.dao.ExpenseDao
import com.settlenow.app.data.local.dao.RoomDao
import com.settlenow.app.data.local.dao.SettlementDao
import com.settlenow.app.data.local.dao.SyncQueueDao
import com.settlenow.app.data.local.dao.SyncStateDao
import com.settlenow.app.data.local.dao.UserDao
import com.settlenow.app.data.local.entity.ConflictLogEntity
import com.settlenow.app.data.local.entity.ExpenseEntity
import com.settlenow.app.data.local.entity.ExpenseParticipantEntity
import com.settlenow.app.data.local.entity.RoomEntity
import com.settlenow.app.data.local.entity.RoomMemberEntity
import com.settlenow.app.data.local.entity.SettlementEntity
import com.settlenow.app.data.local.entity.SyncQueueEntity
import com.settlenow.app.data.local.entity.SyncStateEntity
import com.settlenow.app.data.local.entity.UserEntity

@Database(
    entities = [
        UserEntity::class,
        RoomEntity::class,
        RoomMemberEntity::class,
        ExpenseEntity::class,
        ExpenseParticipantEntity::class,
        SettlementEntity::class,
        SyncQueueEntity::class,
        SyncStateEntity::class,
        ConflictLogEntity::class
    ],
    version = 4,
    exportSchema = false
)
abstract class SettleNowDatabase : RoomDatabase() {

    abstract fun userDao(): UserDao
    abstract fun roomDao(): RoomDao
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
