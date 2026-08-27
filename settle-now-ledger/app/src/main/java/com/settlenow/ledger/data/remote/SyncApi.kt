package com.settlenow.ledger.data.remote

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit

/**
 * Thin Retrofit wrapper. Bodies/responses are raw JSON strings parsed with
 * org.json — no codegen converters, keeps the APK small.
 */
class SyncApi(baseUrl: String) {

    private val jsonType = "application/json; charset=utf-8".toMediaType()

    interface Routes {
        @retrofit2.http.POST("api/sync/push")
        suspend fun push(@retrofit2.http.Body body: RequestBody): Response<ResponseBody>

        @retrofit2.http.POST("api/sync/pull")
        suspend fun pull(@retrofit2.http.Body body: RequestBody): Response<ResponseBody>

        @retrofit2.http.POST("api/rooms/join")
        suspend fun joinRoom(@retrofit2.http.Body body: RequestBody): Response<ResponseBody>
    }

    private val routes: Routes = Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(
            OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(20, TimeUnit.SECONDS)
                .writeTimeout(20, TimeUnit.SECONDS)
                .build()
        )
        .build()
        .create(Routes::class.java)

    suspend fun push(json: String): String? = execute { routes.push(json.toRequestBody(jsonType)) }

    suspend fun pull(json: String): String? = execute { routes.pull(json.toRequestBody(jsonType)) }

    /** Returns the raw body, or null when unreachable. HTTP error codes surface via [ApiError]. */
    suspend fun joinRoom(json: String): String {
        val response = routes.joinRoom(json.toRequestBody(jsonType))
        val bodyText = response.body()?.string().orEmpty()
        if (!response.isSuccessful) throw ApiError(code = response.code(), body = bodyText)
        return bodyText
    }

    class ApiError(val code: Int, val body: String) : RuntimeException("HTTP $code")

    private inline fun execute(call: () -> Response<ResponseBody>): String? =
        call().takeIf { it.isSuccessful }?.body()?.string()
}
