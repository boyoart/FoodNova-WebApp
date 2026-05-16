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
import com.foodnova.delivery.kyc.presentation.identity.IdentityVerificationIntroScreen
import com.foodnova.delivery.kyc.presentation.identity.NinEntryScreen
import com.foodnova.delivery.kyc.presentation.identity.SelfieCaptureScreen
import com.foodnova.delivery.kyc.presentation.identity.VerificationSubmittedScreen
import com.foodnova.delivery.kyc.presentation.verification.AddressVerificationScreen
import com.foodnova.delivery.kyc.presentation.verification.EmergencyContactScreen
import com.foodnova.delivery.kyc.presentation.verification.VerificationViewModel
import com.foodnova.delivery.ui.splash.SplashScreen

@Composable
fun FoodNovaNavGraph() {
    val navController = rememberNavController()
    val onboardingViewModel: OnboardingViewModel = hiltViewModel()
    val verificationViewModel: VerificationViewModel = hiltViewModel()
    val onboardingState by onboardingViewModel.state.collectAsStateWithLifecycle()
    val verificationState by verificationViewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) { verificationViewModel.refreshVerificationStatus() }

    NavHost(navController = navController, startDestination = DeliveryRoute.Splash.route) {
        composable(DeliveryRoute.Splash.route) {
            SplashScreen {
                navController.navigate(DeliveryRoute.AuthPhone.route) {
                    popUpTo(DeliveryRoute.Splash.route) { inclusive = true }
                }
            }
        }
        composable(DeliveryRoute.AuthPhone.route) {
            PhoneEntryScreen(
                viewModel = onboardingViewModel,
                onExistingUser = { navController.navigate(DeliveryRoute.AuthLogin.route) },
                onNewUser = { navController.navigate(DeliveryRoute.AuthRegister.route) }
            )
        }
        composable(DeliveryRoute.AuthLogin.route) {
            LoginScreen(
                viewModel = onboardingViewModel,
                onCreateAccount = { navController.navigate(DeliveryRoute.AuthRegister.route) },
                onAuthenticated = {
                    navController.navigate(DeliveryRoute.KycHub.route) { popUpTo(DeliveryRoute.AuthPhone.route) { inclusive = true } }
                }
            )
        }
        composable(DeliveryRoute.AuthRegister.route) {
            RegistrationScreen(
                viewModel = onboardingViewModel,
                onBackToLogin = { navController.navigate(DeliveryRoute.AuthLogin.route) },
                onRegistered = {
                    navController.navigate(DeliveryRoute.KycHub.route) { popUpTo(DeliveryRoute.AuthPhone.route) { inclusive = true } }
                }
            )
        }
        composable(DeliveryRoute.KycHub.route) {
            VerificationRequiredScreen(
                progress = verificationState.progress,
                onIdentityVerification = { navController.navigate(DeliveryRoute.KycIdentityIntro.route) },
                onAddressVerification = { navController.navigate(DeliveryRoute.KycAddress.route) },
                onEmergencyContact = { navController.navigate(DeliveryRoute.KycEmergency.route) },
                onContinueToDashboard = { navController.navigate(DeliveryRoute.OperationsHome.route) }
            )
        }
        composable(DeliveryRoute.KycIdentityIntro.route) {
            IdentityVerificationIntroScreen(onContinue = { navController.navigate(DeliveryRoute.KycNinEntry.route) })
        }
        composable(DeliveryRoute.KycNinEntry.route) {
            NinEntryScreen(viewModel = verificationViewModel, onContinue = { navController.navigate(DeliveryRoute.KycSelfieCapture.route) })
        }
        composable(DeliveryRoute.KycSelfieCapture.route) {
            SelfieCaptureScreen(viewModel = verificationViewModel, onSubmitted = { navController.navigate(DeliveryRoute.KycSubmitted.route) })
        }
        composable(DeliveryRoute.KycSubmitted.route) {
            VerificationSubmittedScreen(onDone = { navController.navigate(DeliveryRoute.OperationsHome.route) })
        }
        composable(DeliveryRoute.KycAddress.route) {
            AddressVerificationScreen(viewModel = verificationViewModel, onSubmitted = { navController.popBackStack() })
        }
        composable(DeliveryRoute.KycEmergency.route) {
            EmergencyContactScreen(viewModel = verificationViewModel, onSubmitted = { navController.popBackStack() })
        }
        composable(DeliveryRoute.OperationsHome.route) {
            DeliveryDashboardScreen(
                progress = verificationState.progress,
                workerName = onboardingState.fullName.ifBlank { "FoodNova Partner" },
                workerType = onboardingState.workerType.name.lowercase().replaceFirstChar { it.titlecase() },
                onIdentityVerification = { navController.navigate(DeliveryRoute.KycIdentityIntro.route) }
            )
        }
    }
}
