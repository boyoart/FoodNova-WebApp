package com.foodnova.delivery.core

fun <T> Result<T>.toAppResult(): AppResult<T> = fold(
    onSuccess = { AppResult.Success(it) },
    onFailure = { AppResult.Failure(message = it.message ?: "Something went wrong.", cause = it) }
)
