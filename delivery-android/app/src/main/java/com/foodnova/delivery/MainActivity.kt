package com.foodnova.delivery

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.foodnova.delivery.ui.FoodNovaDeliveryApp
import com.foodnova.delivery.ui.theme.FoodNovaDeliveryTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        setContent {
            FoodNovaDeliveryTheme {
                FoodNovaDeliveryApp()
            }
        }
    }
}
