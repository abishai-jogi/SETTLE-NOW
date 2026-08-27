package com.settlenow.ledger.domain

import androidx.compose.ui.graphics.Color
import java.security.SecureRandom

object Palette {

    data class Swatch(val name: String, val hex: String)

    /** Broad solid hues — randomized on signup, never a fixed wheel walk. */
    val ALL = listOf(
        Swatch("Red", "#E53935"),
        Swatch("Orange", "#FB8C00"),
        Swatch("Yellow", "#F9A825"),
        Swatch("Green", "#43A047"),
        Swatch("Teal", "#00897B"),
        Swatch("Blue", "#1E88E5"),
        Swatch("Indigo", "#3949AB"),
        Swatch("Purple", "#8E24AA"),
        Swatch("Pink", "#D81B60"),
        Swatch("Brown", "#6D4C41"),
        Swatch("Cyan", "#00ACC1"),
        Swatch("Deep Orange", "#F4511E")
    )

    fun firstFree(takenHexes: List<String>): String =
        (ALL.firstOrNull { it.hex !in takenHexes } ?: ALL[0]).hex
}

fun parseHexColor(hex: String): Color {
    val rgb = hex.removePrefix("#").toLong(16)
    return Color((0xFF000000L or rgb).toInt())
}

fun tint(hex: String, alpha: Float): Color = parseHexColor(hex).copy(alpha = alpha)

/** True when black text reads better on this color (light backgrounds like mustard/amber). */
fun prefersDarkText(hex: String): Boolean {
    val rgb = hex.removePrefix("#").toLong(16)
    val r = (rgb shr 16) and 0xFF
    val g = (rgb shr 8) and 0xFF
    val b = rgb and 0xFF
    val luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
    return luminance > 0.55
}

object Passwords {

    private const val HEX = "0123456789abcdef"
    private const val K1 = -1640531525 // 2654435761u
    private const val K2 = 1597334677
    private const val K3 = -2048144779 // 2246822507u
    private const val K4 = 3266489909
    private val random = SecureRandom()

    fun makeSalt(): String = buildString { repeat(16) { append(HEX[random.nextInt(HEX.length)]) } }

    private fun hex8(value: Int): String =
        String.format("%08x", value)

    fun hash(password: String, salt: String): String {
        val input = "$salt:$password"
        var h1 = 0xdeadbeef.toInt() xor input.length
        var h2 = 0x41c6ce57.toInt() xor input.length
        for (i in input.indices) {
            val ch = input[i].code
            h1 = h1 xor ch
            h2 = h2 xor ch
            h1 *= K1
            h2 *= K2
            h1 = (h1 shl 13) or (h1 ushr 19)
            h2 = (h2 shl 16) or (h2 ushr 16)
        }
        h1 += h2
        h2 += h1
        h1 = h1 xor (h1 ushr 16)
        h2 = h2 xor (h2 ushr 13)
        h1 *= K3
        h2 *= K4
        h1 = h1 xor (h1 ushr 16)
        h2 = h2 xor (h2 ushr 16)
        return hex8(h1) + hex8(h2) + hex8(h1 xor h2) + hex8(h2 * K1)
    }

    fun verify(password: String, salt: String, expectedHash: String): Boolean =
        expectedHash.isNotEmpty() && hash(password, salt) == expectedHash
}
