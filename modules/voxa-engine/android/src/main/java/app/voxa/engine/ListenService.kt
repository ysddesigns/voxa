package app.voxa.engine

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

/**
 * Keeps Voxa allowed to use the microphone while the screen is off or another app is open.
 * Android requires a foreground service of type "microphone" with a visible notification for that.
 * The service itself does no work: the listening thread runs in VoxaEngineModule.
 *
 * Phase 0 uses it for the 60-minute screen-off test; the Live screen will use it in Phase 1.
 */
class ListenService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val nm = getSystemService(NotificationManager::class.java)
    nm.createNotificationChannel(NotificationChannel(CHANNEL, "Listening", NotificationManager.IMPORTANCE_LOW))
    val open = packageManager.getLaunchIntentForPackage(packageName)
      ?.let { PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE) }
    val notification = Notification.Builder(this, CHANNEL)
      // A plain system icon: adaptive app icons are not allowed as small notification icons.
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setContentTitle(intent?.getStringExtra(EXTRA_TITLE) ?: "Voxa is listening")
      .setContentText("The microphone is on. Open Voxa to stop.")
      .setOngoing(true)
      .setContentIntent(open)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    // Keep the CPU running with the screen off so speech is decoded as it arrives.
    if (wakeLock == null) {
      wakeLock = getSystemService(PowerManager::class.java)
        .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "voxa:listen")
        .apply {
          setReferenceCounted(false)
          acquire(MAX_HOLD_MS)
        }
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    super.onDestroy()
  }

  companion object {
    private const val CHANNEL = "voxa-listen"
    private const val NOTIFICATION_ID = 4201
    private const val EXTRA_TITLE = "title"
    /** Safety limit: the wake lock is dropped after 3 hours even if stop is never called. */
    private const val MAX_HOLD_MS = 3 * 60 * 60 * 1000L

    fun start(context: Context, title: String) {
      context.startForegroundService(Intent(context, ListenService::class.java).putExtra(EXTRA_TITLE, title))
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, ListenService::class.java))
    }
  }
}
