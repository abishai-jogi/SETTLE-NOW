package com.settlenow.firebase.domain

import com.settlenow.firebase.data.model.Expense
import com.settlenow.firebase.data.model.Settlement
import java.util.Calendar

data class Balance(
    val userId: String,
    val netCents: Long
)

data class Transfer(
    val fromUserId: String,
    val toUserId: String,
    val amountCents: Long
)

data class Summary(
    val weekTotalCents: Long,
    val monthTotalCents: Long,
    val weeklyPerPersonCents: Long,
    val monthlyPerPersonCents: Long
)

object BalanceCalculator {

    fun liveExpenses(expenses: List<Expense>): List<Expense> =
        expenses.filter { !it.isDeleted && it.supersededBy == null }

    fun computeNetCents(expenses: List<Expense>, settlements: List<Settlement>): Map<String, Long> {
        val net = HashMap<String, Long>()
        for (expense in liveExpenses(expenses)) {
            for (participant in expense.participants) {
                net.merge(participant.userId, -participant.shareCents, Long::plus)
            }
            net.merge(expense.paidBy, expense.amountCents, Long::plus)
        }
        for (settlement in settlements) {
            net.merge(settlement.fromUserId, settlement.amountCents, Long::plus)
            net.merge(settlement.toUserId, -settlement.amountCents, Long::plus)
        }
        return net
    }

    fun simplify(netCentsByUser: Map<String, Long>): List<Transfer> {
        val debtors = netCentsByUser.filterValues { it < 0 }
            .map { (id, v) -> id to -v }
            .sortedByDescending { it.second }
            .toMutableList()

        val creditors = netCentsByUser.filterValues { it > 0 }
            .map { (id, v) -> id to v }
            .sortedByDescending { it.second }
            .toMutableList()

        val transfers = mutableListOf<Transfer>()
        var i = 0
        var j = 0

        while (i < debtors.size && j < creditors.size) {
            val (debtorId, debtorOwes) = debtors[i]
            val (creditorId, creditorIsOwed) = creditors[j]
            val payment = minOf(debtorOwes, creditorIsOwed)

            if (payment > 0) transfers.add(Transfer(debtorId, creditorId, payment))

            debtors[i] = debtorId to (debtorOwes - payment)
            creditors[j] = creditorId to (creditorIsOwed - payment)

            if (debtors[i].second == 0L) i++
            if (creditors[j].second == 0L) j++
        }
        return transfers
    }

    /** Trailing-7-day total and current calendar-month total, per-person averages. */
    fun summarize(expenses: List<Expense>, memberCount: Int): Summary {
        val now = System.currentTimeMillis()
        val weekCut = now - 7L * 24 * 60 * 60 * 1000

        val calendar = Calendar.getInstance()
        calendar.set(Calendar.DAY_OF_MONTH, 1)
        calendar.set(Calendar.HOUR_OF_DAY, 0)
        calendar.set(Calendar.MINUTE, 0)
        calendar.set(Calendar.SECOND, 0)
        calendar.set(Calendar.MILLISECOND, 0)
        val monthStart = calendar.timeInMillis

        var weekTotal = 0L
        var monthTotal = 0L
        for (expense in liveExpenses(expenses)) {
            val at = expense.createdAtMs ?: continue
            if (at >= weekCut) weekTotal += expense.amountCents
            if (at >= monthStart) monthTotal += expense.amountCents
        }

        val divisor = if (memberCount > 0) memberCount else 1
        return Summary(
            weekTotalCents = weekTotal,
            monthTotalCents = monthTotal,
            weeklyPerPersonCents = weekTotal / divisor,
            monthlyPerPersonCents = monthTotal / divisor
        )
    }
}
