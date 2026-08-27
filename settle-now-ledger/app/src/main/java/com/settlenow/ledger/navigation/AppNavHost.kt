package com.settlenow.ledger.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.settlenow.ledger.data.repo.SettleNowRepository
import com.settlenow.ledger.ui.auth.AuthScreen
import com.settlenow.ledger.ui.balances.BalancesScreen
import com.settlenow.ledger.ui.home.HomeScreen
import com.settlenow.ledger.ui.ledger.LedgerDetailScreen
import com.settlenow.ledger.ui.split.SplitScreen

@Composable
fun AppNavHost(repository: SettleNowRepository) {
    var sessionUserId by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        sessionUserId = repository.currentUserId()
    }

    val userId = sessionUserId
    if (userId == null) {
        AuthScreen(
            repository = repository,
            onSignedIn = { id -> sessionUserId = id }
        )
        return
    }

    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = "home") {
        composable("home") {
            HomeScreen(
                repository = repository,
                onLogout = {
                    repository.logout()
                    sessionUserId = null
                },
                onOpenLedger = { ledgerId -> navController.navigate("ledger/$ledgerId") }
            )
        }
        composable(
            route = "ledger/{ledgerId}",
            arguments = listOf(navArgument("ledgerId") { type = NavType.StringType })
        ) { entry ->
            val ledgerId = entry.arguments?.getString("ledgerId") ?: return@composable
            LedgerDetailScreen(
                repository = repository,
                ledgerId = ledgerId,
                onBack = { navController.popBackStack() },
                onOpenBalances = { id -> navController.navigate("balances/$id") },
                onStartSplit = { id, cents ->
                    navController.navigate("split/$id/$cents")
                }
            )
        }
        composable(
            route = "split/{ledgerId}/{amountCents}",
            arguments = listOf(
                navArgument("ledgerId") { type = NavType.StringType },
                navArgument("amountCents") { type = NavType.LongType }
            )
        ) { entry ->
            val ledgerId = entry.arguments?.getString("ledgerId") ?: return@composable
            val amountCents = entry.arguments?.getLong("amountCents") ?: return@composable
            SplitScreen(
                repository = repository,
                ledgerId = ledgerId,
                amountCents = amountCents,
                onBack = { navController.popBackStack() }
            )
        }
        composable(
            route = "balances/{ledgerId}",
            arguments = listOf(navArgument("ledgerId") { type = NavType.StringType })
        ) { entry ->
            val ledgerId = entry.arguments?.getString("ledgerId") ?: return@composable
            BalancesScreen(
                repository = repository,
                ledgerId = ledgerId,
                onBack = { navController.popBackStack() }
            )
        }
    }
}
