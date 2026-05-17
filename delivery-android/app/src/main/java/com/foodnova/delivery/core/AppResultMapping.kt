package com.foodnova.delivery.core

import org.json.JSONObject
import retrofit2.HttpException

fun <T> Result<T>.toAppResult(): AppResult<T> = fold(
    onSuccess = { AppResult.Success(it) },
    onFailure = { AppResult.Failure(message = it.toFriendlyMessage(), cause = it) }
)

private fun Throwable.toFriendlyMessage(): String {
    if (this is HttpException) {
        val body = response()?.errorBody()?.string().orEmpty()
        val detail = runCatching {
            val json = JSONObject(body)
            json.optString("detail")
                .ifBlank { json.optString("message") }
                .ifBlank { json.optString("error") }
        }.getOrNull().orEmpty()
        if (detail.isNotBlank()) return detail
        return when (code()) {
            401 -> "Invalid phone number or password."
            403 -> "This delivery account is not allowed to sign in."
            404 -> "Delivery account not found."
            422 -> "Please check your login details and try again."
            else -> "Server error ${code()}. Please try again."
        }
    }
    return message ?: "Something went wrong."
}
