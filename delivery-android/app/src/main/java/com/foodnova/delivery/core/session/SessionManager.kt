package com.foodnova.delivery.core.session

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

@Singleton
class SessionManager @Inject constructor(
    private val dataStore: DataStore<Preferences>
) {
    val session: Flow<SessionState> = dataStore.data.map { preferences ->
        val token = preferences[ACCESS_TOKEN]
        val workerId = preferences[WORKER_ID]
        SessionState(
            accessToken = token,
            workerId = workerId,
            isAuthenticated = !token.isNullOrBlank()
        )
    }

    suspend fun accessToken(): String? = session.first().accessToken

    suspend fun sessionValue(): SessionState = session.first()

    suspend fun saveSession(accessToken: String, workerId: String?) {
        dataStore.edit { preferences ->
            preferences[ACCESS_TOKEN] = accessToken
            workerId?.let { preferences[WORKER_ID] = it }
        }
    }

    suspend fun clearSession() {
        dataStore.edit { it.clear() }
    }

    private companion object {
        val ACCESS_TOKEN = stringPreferencesKey("delivery_access_token")
        val WORKER_ID = stringPreferencesKey("delivery_worker_id")
    }
}
