package com.settlenow.ledger.domain

import java.security.SecureRandom
import kotlin.math.abs
import kotlin.math.min

/**
 * Picks identity colors randomly from a broad solid palette while keeping the
 * chosen hue far away from every color already in use — so two members never
 * look similar at a glance. Assignment order is not a predictable wheel walk.
 */
object ColorPicker {

    private val random = SecureRandom()

    /** Reject candidates closer than this angular distance (degrees) to any taken hue. */
    private const val MIN_HUE_GAP = 40f

    fun pick(takenHexes: List<String>): String {
        val free = Palette.ALL.filter { it.hex !in takenHexes }
        if (free.isEmpty()) return Palette.ALL[random.nextInt(Palette.ALL.size)].hex

        val takenHues = takenHexes.mapNotNull { hueOf(it) }
        if (takenHues.isEmpty()) return free[random.nextInt(free.size)].hex

        val scored = free.map { swatch ->
            val hue = hueOf(swatch.hex)
            val distance = if (hue == null) 999f else takenHues.minOf { angularDistance(hue, it) }
            swatch to distance
        }

        val farEnough = scored.filter { it.second >= MIN_HUE_GAP }
        val pool = if (farEnough.isNotEmpty()) {
            farEnough
        } else {
            val best = scored.maxOf { it.second }
            scored.filter { it.second >= best - 10f }
        }
        return pool[random.nextInt(pool.size)].first.hex
    }

    /** Angular distance in degrees on the color wheel (0–180). */
    private fun angularDistance(a: Float, b: Float): Float {
        val diff = abs(a - b) % 360f
        return min(diff, 360f - diff)
    }

    /** RGB → hue in degrees; null for near-neutral colors without a meaningful hue. */
    fun hueOf(hex: String): Float? {
        val rgb = hex.removePrefix("#").toLong(16)
        val r = ((rgb shr 16) and 0xFF).toFloat() / 255f
        val g = ((rgb shr 8) and 0xFF).toFloat() / 255f
        val b = (rgb and 0xFF).toFloat() / 255f

        val max = maxOf(r, g, b)
        val minV = minOf(r, g, b)
        val delta = max - minV
        if (delta < 0.12f) return null

        val hue = when (max) {
            r -> 60f * (((g - b) / delta) % 6f)
            g -> 60f * (((b - r) / delta) + 2f)
            else -> 60f * (((r - g) / delta) + 4f)
        }
        return (hue + 360f) % 360f
    }
}
