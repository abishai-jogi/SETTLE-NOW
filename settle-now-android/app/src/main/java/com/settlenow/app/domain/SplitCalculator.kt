package com.settlenow.app.domain

import com.settlenow.app.data.local.entity.SplitTypes

/**
 * All allocations are integer-cent math with deterministic remainder handling
 * (sorted user ids), so two devices computing the same split offline always
 * agree to the cent.
 */
object SplitCalculator {

    sealed interface ValidationResult {
        data class Valid(val shares: List<Pair<String, Long>>) : ValidationResult
        data class Invalid(val reason: String) : ValidationResult
    }

    fun equalShares(totalCents: Long, participantIds: List<String>): ValidationResult =
        if (participantIds.isEmpty()) {
            Invalid("Pick at least one person")
        } else {
            Valid(BalanceCalculator.equalShares(totalCents, participantIds))
        }

    fun customShares(totalCents: Long, entries: Map<String, String>): ValidationResult {
        if (entries.isEmpty()) return Invalid("Pick at least one person")
        var sum = 0L
        val shares = mutableListOf<Pair<String, Long>>()
        for ((userId, text) in entries) {
            val cents = Money.parseToCents(text)
                ?: return Invalid("Enter an amount for everyone splitting")
            sum += cents
            shares.add(userId to cents)
        }
        return if (sum == totalCents) {
            Valid(shares)
        } else {
            Invalid(
                "Assigned ${Money.formatCents(sum)} of ${Money.formatCents(totalCents)} — " +
                    if (sum < totalCents) "${Money.formatCents(totalCents - sum)} left" else "${Money.formatCents(sum - totalCents)} over"
            )
        }
    }

    fun percentageShares(totalCents: Long, entries: Map<String, String>): ValidationResult {
        if (entries.isEmpty()) return Invalid("Pick at least one person")
        var percentSum = 0
        val parsed = mutableListOf<Pair<String, Int>>()
        for ((userId, text) in entries) {
            val percent = text.trim().toIntOrNull()
                ?: return Invalid("Enter a percentage for everyone splitting")
            if (percent !in 0..100) return Invalid("Percentages must be between 0 and 100")
            percentSum += percent
            parsed.add(userId to percent)
        }
        if (percentSum != 100) return Invalid("Percentages must total 100% (currently $percentSum%)")

        val ordered = parsed.sortedBy { it.first }
        var allocated = 0L
        val bases = ordered.map { (userId, percent) ->
            val base = (totalCents * percent.toLong()) / 100L
            allocated += base
            userId to base
        }
        val remainder = totalCents - allocated
        return Valid(bases.mapIndexed { index, (userId, base) ->
            userId to (base + if (index < remainder) 1L else 0L)
        })
    }

    fun isValid(type: String, totalCents: Long, participantIds: List<String>, entries: Map<String, String>): Boolean =
        when (type) {
            SplitTypes.EQUAL -> participantIds.isNotEmpty()
            SplitTypes.CUSTOM -> customShares(totalCents, entries) is ValidationResult.Valid
            SplitTypes.PERCENTAGE -> percentageShares(totalCents, entries) is ValidationResult.Valid
            else -> false
        }
}
