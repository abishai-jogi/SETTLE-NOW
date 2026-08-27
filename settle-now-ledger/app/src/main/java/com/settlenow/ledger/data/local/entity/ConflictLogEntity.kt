package com.settlenow.ledger.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Losing versions under last-write-wins are preserved here so no offline edit
 * ever disappears without a trace.
 */
@Entity(
    tableName = "conflict_log",
    indices = [Index("entity_type", "entity_id")]
)
data class ConflictLogEntity(
    @PrimaryKey(autoGenerate = true) @ColumnInfo(name = "id") val id: Long = 0,
    @ColumnInfo(name = "entity_type") val entityType: String,
    @ColumnInfo(name = "entity_id") val entityId: String,
    @ColumnInfo(name = "source") val source: String,
    @ColumnInfo(name = "losing_payload") val losingPayload: String,
    @ColumnInfo(name = "losing_updated_at") val losingUpdatedAt: Long?,
    @ColumnInfo(name = "winner_updated_at") val winnerUpdatedAt: Long?,
    @ColumnInfo(name = "detected_at") val detectedAt: Long
)

object ConflictSources {
    const val PUSH = "push"
    const val PULL = "pull"
}
