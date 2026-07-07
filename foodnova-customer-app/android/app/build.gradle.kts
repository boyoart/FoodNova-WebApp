import java.util.Base64
import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystorePropertiesFile.inputStream().use { keystoreProperties.load(it) }
}
val releaseKeystoreFile = keystoreProperties["storeFile"]?.toString()?.let { rootProject.file(it) }
val hasReleaseSigning =
    releaseKeystoreFile?.exists() == true &&
        keystoreProperties["storePassword"] != null &&
        keystoreProperties["keyAlias"] != null &&
        keystoreProperties["keyPassword"] != null

fun dartDefineValue(name: String): String? {
    val encoded = project.findProperty("dart-defines")?.toString() ?: return null
    return encoded.split(",")
        .mapNotNull { item ->
            try {
                String(Base64.getDecoder().decode(item))
            } catch (_: Exception) {
                null
            }
        }
        .firstOrNull { it.startsWith("$name=") }
        ?.substringAfter("=")
        ?.takeIf { it.isNotBlank() }
}

fun resolvedGoogleMapsApiKey(): String {
    return project.findProperty("GOOGLE_MAPS_API_KEY")?.toString()?.takeIf { it.isNotBlank() }
        ?: System.getenv("GOOGLE_MAPS_API_KEY")?.takeIf { it.isNotBlank() }
        ?: dartDefineValue("GOOGLE_MAPS_API_KEY")
        ?: ""
}

if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
} else {
    logger.warn("FoodNova Firebase: android/app/google-services.json is missing; Google Services plugin skipped for this local build.")
}

android {
    namespace = "app.foodnova.customer"
    compileSdk = 36
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }

    defaultConfig {
        applicationId = "app.foodnova.customer"
        minSdk = flutter.minSdkVersion
        targetSdk = 36
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        manifestPlaceholders["GOOGLE_MAPS_API_KEY"] = resolvedGoogleMapsApiKey()
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
                storeFile = releaseKeystoreFile
                storePassword = keystoreProperties["storePassword"] as String
            }
        }
    }

    buildTypes {
        release {
            signingConfig = if (hasReleaseSigning) {
                signingConfigs.getByName("release")
            } else {
                logger.warn("FoodNova release signing is not configured; falling back to debug signing for local build only.")
                signingConfigs.getByName("debug")
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
