package com.settlenow.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.settlenow.app.data.repo.SettleNowRepository
import com.settlenow.app.sync.SyncEngine
import com.settlenow.app.ui.auth.AuthScreen
import com.settlenow.app.ui.balances.BalancesScreen
import com.settlenow.app.ui.expense.AddExpenseScreen
import com.settlenow.app.ui.home.HomeScreen
import com.settlenow.app.ui.room.RoomDetailScreen

@Composable
fun AppNavHost(repository: SettleNowRepository, syncEngine: SyncEngine) {
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
                syncEngine = syncEngine,
                onLogout = {
                    repository.logout()
                    sessionUserId = null
                },
                onOpenRoom = { roomId -> navController.navigate("room/$roomId") }
            )
        }
        composable("room/{roomId}") { entry ->
            val roomId = entry.arguments?.getString("roomId") ?: return@composable
            RoomDetailScreen(
                repository = repository,
                roomId = roomId,
                onBack = { navController.popBackStack() },
                onAddExpense = { id -> navController.navigate("add_expense/$id") },
                onOpenBalances = { id -> navController.navigate("balances/$id") }
            )
        }
        composable("add_expense/{roomId}") { entry ->
            val roomId = entry.arguments?.getString("roomId") ?: return@composable
            AddExpenseScreen(
                repository = repository,
                roomId = roomId,
                onBack = { navController.popBackStack() }
            )
        }
        composable("balances/{roomId}") { entry ->
            val roomId = entry.arguments?.getString("roomId") ?: return@composable
            BalancesScreen(
                repository = repository,
                roomId = roomId,
                onBack = { navController.popBackStack() }
            )
        }
    }
}
