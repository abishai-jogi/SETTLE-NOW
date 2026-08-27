package com.settlenow.firebase.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.settlenow.firebase.data.repo.FirebaseRepository
import com.settlenow.firebase.ui.expense.AddExpenseScreen
import com.settlenow.firebase.ui.home.HomeScreen
import com.settlenow.firebase.ui.room.RoomDetailScreen

@Composable
fun AppNavHost(repository: FirebaseRepository) {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = "home") {
        composable("home") {
            HomeScreen(
                repository = repository,
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
                onEditExpense = { id, expenseId ->
                    navController.navigate("add_expense/$id?supersedes=$expenseId")
                }
            )
        }
        composable(
            route = "add_expense/{roomId}?supersedes={supersedes}",
            arguments = listOf(
                navArgument("supersedes") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                }
            )
        ) { entry ->
            val roomId = entry.arguments?.getString("roomId") ?: return@composable
            val supersedes = entry.arguments?.getString("supersedes")
            AddExpenseScreen(
                repository = repository,
                roomId = roomId,
                supersedes = supersedes,
                onBack = { navController.popBackStack() }
            )
        }
    }
}
