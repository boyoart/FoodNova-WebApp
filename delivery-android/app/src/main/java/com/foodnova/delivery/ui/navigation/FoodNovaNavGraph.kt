package com.foodnova.delivery.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.foodnova.delivery.auth.presentation.LoginScreen
import com.foodnova.delivery.auth.presentation.PhoneEntryScreen
import com.foodnova.delivery.auth.presentation.RegistrationScreen
import com.foodnova.delivery.auth.presentation.VerificationRequiredScreen
import com.foodnova.delivery.auth.presentation.onboarding.OnboardingViewModel
import com.foodnova.delivery.delivery.presentation.DeliveryDashboardScreen
import com.foodnova.delivery.kyc.presentation.verification.AddressVerificationScreen
import com.foodnova.delivery.kyc.presentation.verification.EmergencyContactScreen
import com.foodnova.delivery.kyc.presentation.verification.VerificationViewModel
import com.foodnova.delivery.ui.splash.SplashScreen

@Composable
fun FoodNovaNavGraph() {
    val navController = rememberNavController()
    val onboardingViewModel: OnboardingViewModel = hiltViewModel()
    val verificationViewModel: VerificationViewModel = hiltViewModel()
    val verificationState by verificationViewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) {
        verificationViewModel.refreshVerificationStatus()
    }

    NavHost(
        navController = navController,
        startDestination = DeliveryRoute.Splash.route
    ) {
        composable(DeliveryRoute.Splash.route) {
            SplashScreen(
                onFinished = {
                    navController.navigate(DeliveryRoute.PhoneEntry.route) {
                        popUpTo(DeliveryRoute.Splash.route) { inclusive = true }
                    }
                }
            )
        }
        composable(DeliveryRoute.PhoneEntry.route) {
            PhoneEntryScreen(
                viewModel = onboardingViewModel,
                onExistingUser = { navController.navigate(DeliveryRoute.Login.route) },
                onNewUser = { navController.navigate(DeliveryRoute.Register.route) }
            )
        }
        composable(DeliveryRoute.Login.route) {
            LoginScreen(
                viewModel = onboardingViewModel,
                onCreateAccount = { navController.navigate(DeliveryRoute.Register.route) },
                onAuthenticated = {
                    navController.navigate(DeliveryRoute.VerificationRequired.route) {
                        popUpTo(DeliveryRoute.PhoneEntry.route) { inclusive = true }
                    }
                }
            )
        }
        composable(DeliveryRoute.Register.route) {
            RegistrationScreen(
                viewModel = onboardingViewModel,
                onBackToLogin = { navController.navigate(DeliveryRoute.Login.route) },
                onRegistered = {
                    navController.navigate(DeliveryRoute.VerificationRequired.route) {
                        popUpTo(DeliveryRoute.PhoneEntry.route) { inclusive = true }
                    }
                }
            )
        }
        composable(DeliveryRoute.VerificationRequired.route) {
            VerificationRequiredScreen(
                progress = verificationState.progress,
                onAddressVerification = { navController.navigate(DeliveryRoute.AddressVerification.route) },
                onEmergencyContact = { navController.navigate(DeliveryRoute.EmergencyContact.route) },
                onContinueToDashboard = {
                    navController.navigate(DeliveryRoute.Dashboard.route) {
                        popUpTo(DeliveryRoute.VerificationRequired.route) { inclusive = true }
                    }
                }
            )
        }
        composable(DeliveryRoute.AddressVerification.route) {
            AddressVerificationScreen(
                viewModel = verificationViewModel,
                onSubmitted = { navController.popBackStack() }
            )
        }
        composable(DeliveryRoute.EmergencyContact.route) {
            EmergencyContactScreen(
                viewModel = verificationViewModel,
                onSubmitted = { navController.popBackStack() }
            )
        }
        composable(DeliveryRoute.Dashboard.route) {
            DeliveryDashboardScreen(progress = verificationState.progress)
        }
    }
}
