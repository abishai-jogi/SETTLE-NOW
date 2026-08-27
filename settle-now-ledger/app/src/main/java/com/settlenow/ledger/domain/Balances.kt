package com.settlenow.ledger.domain

data class Balance(
    val userId: String,
    val netCents: Long
)

data class Transfer(
    val fromUserId: String,
    val toUserId: String,
    val amountCents: Long
)

object BalanceCalculator {

    fun computeNetCents(
        expenses: List<com.settlenow.ledger.data.local.dao.ExpenseWithParticipants>,
        settlements: List<com.settlenow.ledger.data.local.entity.SettlementEntity>
    ): Map<String, Long> {
        val net = HashMap<String, Long>()
        for (entry in expenses) {
            if (entry.expense.isDeleted) continue
            for (participant in entry.participants) {
                if (participant.isDeleted) continue
                net.merge(participant.userId, -participant.shareCents, Long::plus)
            }
            net.merge(entry.expense.paidBy, entry.expense.amountCents, Long::plus)
        }
        for (settlement in settlements) {
            if (settlement.isDeleted) continue
            net.merge(settlement.fromUser, settlement.amountCents, Long::plus)
            net.merge(settlement.toUser, -settlement.amountCents, Long::plus)
        }
        return net
    }

    fun equalShares(totalCents: Long, participantIds: List<String>): List<Pair<String, Long>> {
        val ids = participantIds.distinct().sorted()
        val n = ids.size
        if (n == 0 || totalCents <= 0) return emptyList()
        val base = totalCents / n
        val remainder = totalCents % n
        return ids.mapIndexed { index, id ->
            val share = base + if (index < remainder) 1L else 0L
            id to share
        }
    }
}

object DebtSimplifier {

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

            if (payment > 0) {
                transfers.add(Transfer(debtorId, creditorId, payment))
            }

            debtors[i] = debtorId to (debtorOwes - payment)
            creditors[j] = creditorId to (creditorIsOwed - payment)

            if (debtors[i].second == 0L) i++
            if (creditors[j].second == 0L) j++
        }
        return transfers
    }
}
