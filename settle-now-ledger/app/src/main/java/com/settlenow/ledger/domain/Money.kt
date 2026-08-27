package com.settlenow.ledger.domain

import java.math.BigDecimal
import java.math.RoundingMode
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToLong

object Money {

    fun parseToCents(input: String): Long? {
        val cleaned = input.trim()
        if (cleaned.isEmpty()) return null
        return try {
            val value = BigDecimal(cleaned).setScale(2, RoundingMode.HALF_UP)
            if (value.signum() < 0) null else value.movePointRight(2).toBigIntegerExact().longValueExact()
        } catch (_: Exception) {
            null
        }
    }

    fun formatCents(cents: Long): String {
        val format = NumberFormat.getNumberInstance(Locale.US)
        format.minimumFractionDigits = 2
        format.maximumFractionDigits = 2
        val rupees = abs(cents) / 100.0
        val sign = if (cents < 0) "-" else ""
        return "$sign\u20B9${format.format(rupees)}"
    }

    /** Formats an in-progress entry like "1250.5" → "₹1,250.5" for the keypad display. */
    fun draftMoney(raw: String): String {
        if (raw.isEmpty()) return ""
        val parts = raw.split(".")
        val grouped = parts[0].ifEmpty { "0" }.toLongOrNull()
            ?.let { NumberFormat.getNumberInstance(Locale.US).format(it) } ?: "0"
        return "\u20B9$grouped" + if (parts.size > 1) ".${parts[1]}" else "."
    }
}

fun Double.toCents(): Long = (this * 100).roundToLong()
