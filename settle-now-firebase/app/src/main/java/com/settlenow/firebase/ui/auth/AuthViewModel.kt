package com.settlenow.firebase.ui.auth

import android.app.Activity
import androidx.lifecycle.ViewModel
import com.google.firebase.FirebaseException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.PhoneAuthCredential
import com.google.firebase.auth.PhoneAuthOptions
import com.google.firebase.auth.PhoneAuthProvider
import kotlinx.coroutines.flow.MutableStateFlow
import java.util.concurrent.TimeUnit

enum class AuthStage { PHONE, OTP }

data class AuthUiState(
    val stage: AuthStage = AuthStage.PHONE,
    val phone: String = "",
    val loading: Boolean = false,
    val error: String? = null,
    val info: String? = null
)

class AuthViewModel(private val auth: FirebaseAuth) : ViewModel() {

    val state = MutableStateFlow(AuthUiState())

    private var verificationId: String? = null
    private var resendToken: PhoneAuthProvider.ForceResendingToken? = null

    private val callbacks = object : PhoneAuthProvider.OnVerificationStateChangedCallbacks() {
        override fun onVerificationCompleted(credential: PhoneAuthCredential) {
            signInWith(credential)
        }

        override fun onVerificationFailed(exception: FirebaseException) {
            state.value = state.value.copy(
                loading = false,
                error = exception.message ?: "Verification failed"
            )
        }

        override fun onCodeSent(id: String, token: PhoneAuthProvider.ForceResendingToken) {
            verificationId = id
            resendToken = token
            state.value = state.value.copy(stage = AuthStage.OTP, loading = false)
        }
    }

    fun setPhone(value: String) {
        state.value = state.value.copy(phone = value, error = null)
    }

    fun startVerification(activity: Activity) {
        val raw = state.value.phone.trim()
        if (!raw.startsWith("+") || raw.length < 8) {
            state.value = state.value.copy(error = "Enter the number in international format, e.g. +919876543210")
            return
        }
        state.value = state.value.copy(loading = true, error = null)
        sendCode(raw, activity)
    }

    fun resend(activity: Activity) {
        val raw = state.value.phone.trim()
        val builder = PhoneAuthOptions.newBuilder(auth)
            .setPhoneNumber(raw)
            .setTimeout(60L, TimeUnit.SECONDS)
            .setActivity(activity)
            .setCallbacks(callbacks)
        resendToken?.let { builder.setForceResendingToken(it) }
        state.value = state.value.copy(loading = true, error = null)
        PhoneAuthProvider.verifyPhoneNumber(builder.build())
    }

    fun submitOtp(code: String) {
        val id = verificationId ?: return
        if (code.length < 6) {
            state.value = state.value.copy(error = "Enter the 6-digit code")
            return
        }
        state.value = state.value.copy(loading = true, error = null)
        signInWith(PhoneAuthProvider.getCredential(id, code))
    }

    private fun sendCode(phone: String, activity: Activity) {
        PhoneAuthProvider.verifyPhoneNumber(
            PhoneAuthOptions.newBuilder(auth)
                .setPhoneNumber(phone)
                .setTimeout(60L, TimeUnit.SECONDS)
                .setActivity(activity)
                .setCallbacks(callbacks)
                .build()
        )
    }

    private fun signInWith(credential: PhoneAuthCredential) {
        auth.signInWithCredential(credential)
            .addOnCompleteListener { task ->
                if (!task.isSuccessful) {
                    state.value = state.value.copy(
                        loading = false,
                        error = task.exception?.message ?: "Sign-in failed"
                    )
                } else {
                    // MainActivity reacts to the auth-state listener; nothing to do here.
                    state.value = state.value.copy(loading = false)
                }
            }
    }
}
